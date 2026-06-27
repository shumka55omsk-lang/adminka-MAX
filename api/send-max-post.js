import { requireAdmin, requireToken, serializeFetchError } from './_max.js';
import { saveSendLogs } from './_logs.js';
import { normalizeButtons, normalizeChatIds, sendToChats } from './_sendCore.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb'
    }
  }
};

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

    const { invalidChatIds, uniqueChatIds } = normalizeChatIds(chatIds);

    if (invalidChatIds.length) {
      return res.status(400).json({
        ok: false,
        error: 'Некорректный chat_id. Отправка в chat_id = 0 запрещена. Удалите неправильную группу из Supabase и дождитесь настоящего chat_id через Webhook.',
        invalidChatIds
      });
    }

    if (!uniqueChatIds.length) {
      return res.status(400).json({ ok: false, error: 'Выберите хотя бы одну группу' });
    }

    if (uniqueChatIds.length > 30) {
      return res.status(400).json({ ok: false, error: 'За один раз можно отправить максимум в 30 групп' });
    }

    const safeButtons = normalizeButtons(buttons);
    const sendResult = await sendToChats({
      chatIds: uniqueChatIds,
      text: cleanText,
      buttons: safeButtons,
      imageDataUrl
    });

    const logResult = await saveSendLogs({
      text: cleanText,
      buttons: safeButtons,
      chatIds: uniqueChatIds,
      results: sendResult.results,
      hasImage: sendResult.hasImage
    }).catch((error) => ({ saved: false, error: error.message }));

    return res.status(200).json({
      ok: sendResult.ok,
      sent: sendResult.sent,
      failed: sendResult.failed,
      hasImage: sendResult.hasImage,
      log: logResult,
      results: sendResult.results
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, baseUrl: error.baseUrl || null, details: error.details || serializeFetchError(error) });
  }
}
