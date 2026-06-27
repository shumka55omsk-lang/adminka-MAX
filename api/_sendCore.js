import { fetchWithMaxTls, maxFetch } from './_max.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeButtons(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map((btn) => ({
      text: String(btn?.text || '').trim(),
      url: String(btn?.url || '').trim()
    }))
    .filter((btn) => btn.text && /^https?:\/\//i.test(btn.url))
    .slice(0, 6);
}

export function normalizeChatIds(input) {
  const rawChatIds = Array.isArray(input) ? input : [];
  const normalizedChatIds = rawChatIds.map((id) => Number(id));
  const invalidChatIds = normalizedChatIds.filter((id) => !Number.isSafeInteger(id) || id === 0);
  const uniqueChatIds = [...new Set(normalizedChatIds.filter((id) => Number.isSafeInteger(id) && id !== 0))];
  return { normalizedChatIds, invalidChatIds, uniqueChatIds };
}

function buildAttachments(buttons, imagePayload) {
  const attachments = [];

  if (imagePayload) {
    attachments.push({
      type: 'image',
      payload: imagePayload
    });
  }

  if (buttons.length) {
    attachments.push({
      type: 'inline_keyboard',
      payload: {
        buttons: [
          buttons.map((btn) => ({
            type: 'link',
            text: btn.text,
            url: btn.url
          }))
        ]
      }
    });
  }

  return attachments;
}

function parseImageDataUrl(imageDataUrl) {
  if (!imageDataUrl) return null;

  const match = String(imageDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Некорректный формат изображения. Нужен JPG/PNG/GIF/WEBP через data URL.');
  }

  const contentType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.length > 6 * 1024 * 1024) {
    throw new Error('Изображение слишком большое. Для MVP ограничение 6 МБ. Сожмите фото.');
  }

  return { contentType, buffer };
}

export async function uploadImage(imageDataUrl) {
  const image = parseImageDataUrl(imageDataUrl);
  if (!image) return null;

  const initResult = await maxFetch('/uploads?type=image', { method: 'POST' });
  const initData = initResult.data;
  if (!initResult.ok || !initData?.url) {
    throw new Error(`MAX не выдал URL для загрузки изображения. HTTP ${initResult.status}: ${JSON.stringify(initData)}`);
  }

  const form = new FormData();
  const blob = new Blob([image.buffer], { type: image.contentType });
  const extension = image.contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  form.append('data', blob, `post-image.${extension}`);

  const uploadResponse = await fetchWithMaxTls(initData.url, {
    method: 'POST',
    body: form
  });

  const uploadData = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || !uploadData) {
    throw new Error('Ошибка загрузки изображения в MAX: ' + JSON.stringify(uploadData));
  }

  return uploadData;
}

export async function sendMessage(chatId, text, buttons, imagePayload, attempt = 1) {
  const body = {
    text,
    attachments: buildAttachments(buttons, imagePayload)
  };

  const result = await maxFetch(`/messages?chat_id=${encodeURIComponent(chatId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = result.data;

  const isAttachmentNotReady = data?.code === 'attachment.not.ready' || String(data?.message || '').includes('not.processed');
  if (!result.ok && isAttachmentNotReady && attempt < 4) {
    await sleep(1000 * attempt);
    return sendMessage(chatId, text, buttons, imagePayload, attempt + 1);
  }

  return {
    chatId,
    ok: result.ok,
    status: result.status,
    data
  };
}

export async function sendToChats({ chatIds, text, buttons = [], imageDataUrl = null, delayBetweenMs = 150 }) {
  const safeButtons = normalizeButtons(buttons);
  const imagePayload = await uploadImage(imageDataUrl);

  if (imagePayload) {
    await sleep(900);
  }

  const results = [];
  for (const chatId of chatIds) {
    const result = await sendMessage(chatId, text, safeButtons, imagePayload);
    results.push(result);
    await sleep(delayBetweenMs);
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;

  return {
    ok: failed === 0,
    sent,
    failed,
    hasImage: Boolean(imagePayload),
    buttons: safeButtons,
    results
  };
}
