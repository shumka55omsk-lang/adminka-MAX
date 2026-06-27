import { authHeaders, getMaxApiBaseUrl, requireAdmin, requireToken } from './_max.js';
import { saveSendLogs } from './_logs.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb'
    }
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeButtons(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map((btn) => ({
      text: String(btn?.text || '').trim(),
      url: String(btn?.url || '').trim()
    }))
    .filter((btn) => btn.text && /^(https?:\/\/|tel:)/i.test(btn.url))
    .slice(0, 6);
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

async function uploadImage(imageDataUrl) {
  const image = parseImageDataUrl(imageDataUrl);
  if (!image) return null;

  const baseUrl = getMaxApiBaseUrl();
  const initResponse = await fetch(`${baseUrl}/uploads?type=image`, {
    method: 'POST',
    headers: authHeaders()
  });

  const initData = await initResponse.json().catch(() => null);
  if (!initResponse.ok || !initData?.url) {
    throw new Error('MAX не выдал URL для загрузки изображения: ' + JSON.stringify(initData));
  }

  const form = new FormData();
  const blob = new Blob([image.buffer], { type: image.contentType });
  const extension = image.contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  form.append('data', blob, `post-image.${extension}`);

  const uploadResponse = await fetch(initData.url, {
    method: 'POST',
    body: form
  });

  const uploadData = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || !uploadData) {
    throw new Error('Ошибка загрузки изображения в MAX: ' + JSON.stringify(uploadData));
  }

  return uploadData;
}

async function sendMessage(chatId, text, buttons, imagePayload, attempt = 1) {
  const body = {
    text,
    attachments: buildAttachments(buttons, imagePayload)
  };

  const response = await fetch(`${getMaxApiBaseUrl()}/messages?chat_id=${encodeURIComponent(chatId)}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);

  const isAttachmentNotReady = data?.code === 'attachment.not.ready' || String(data?.message || '').includes('not.processed');
  if (!response.ok && isAttachmentNotReady && attempt < 4) {
    await sleep(1000 * attempt);
    return sendMessage(chatId, text, buttons, imagePayload, attempt + 1);
  }

  return {
    chatId,
    ok: response.ok,
    status: response.status,
    data
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (!requireAdmin(req, res)) return;
    if (!requireToken(res)) return;

    const { chatIds, text, buttons, imageDataUrl } = req.body || {};
    const cleanText = String(text || '').trim();

    if (!cleanText || cleanText.length < 3) {
      return res.status(400).json({ ok: false, error: 'Введите текст поста' });
    }

    if (cleanText.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Текст MAX-сообщения должен быть до 4000 символов' });
    }

    const uniqueChatIds = [...new Set((Array.isArray(chatIds) ? chatIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id)))];

    if (!uniqueChatIds.length) {
      return res.status(400).json({ ok: false, error: 'Выберите хотя бы одну группу' });
    }

    if (uniqueChatIds.length > 30) {
      return res.status(400).json({ ok: false, error: 'За один раз можно отправить максимум в 30 групп' });
    }

    const safeButtons = normalizeButtons(buttons);
    const imagePayload = await uploadImage(imageDataUrl);

    if (imagePayload) {
      await sleep(900);
    }

    const results = [];
    for (const chatId of uniqueChatIds) {
      const result = await sendMessage(chatId, cleanText, safeButtons, imagePayload);
      results.push(result);
      await sleep(150);
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    const logResult = await saveSendLogs({
      text: cleanText,
      buttons: safeButtons,
      chatIds: uniqueChatIds,
      results,
      hasImage: Boolean(imagePayload)
    }).catch((error) => ({ saved: false, error: error.message }));

    return res.status(200).json({
      ok: failed === 0,
      sent,
      failed,
      hasImage: Boolean(imagePayload),
      log: logResult,
      results
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
