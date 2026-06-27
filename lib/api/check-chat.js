import { maxFetch, requireAdmin, requireToken, serializeFetchError } from './_max.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!requireAdmin(req, res)) return;
    if (!requireToken(res)) return;

    const { chat_id } = req.body || {};
    const chatId = Number(chat_id);
    if (!Number.isSafeInteger(chatId) || chatId === 0) {
      return res.status(400).json({ ok: false, error: 'Некорректный chat_id. Он не может быть пустым или равным 0.' });
    }

    const result = await maxFetch(`/chats/${encodeURIComponent(chatId)}/members/me`, { method: 'GET' });
    return res.status(200).json({
      ok: result.ok,
      status: result.status,
      data: result.data,
      baseUrl: result.baseUrl
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      baseUrl: error.baseUrl || null,
      details: error.details || serializeFetchError(error)
    });
  }
}
