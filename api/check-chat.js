import { authHeaders, getMaxApiBaseUrl, requireAdmin, requireToken } from './_max.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;
  if (!requireToken(res)) return;

  const { chatId } = req.body || {};
  const numericChatId = Number(chatId);
  if (!Number.isFinite(numericChatId)) {
    return res.status(400).json({ ok: false, error: 'Некорректный chat_id' });
  }

  const response = await fetch(`${getMaxApiBaseUrl()}/chats/${numericChatId}/members/me`, {
    method: 'GET',
    headers: authHeaders()
  });

  const data = await response.json().catch(() => null);
  return res.status(response.ok ? 200 : response.status).json({
    ok: response.ok,
    status: response.status,
    data
  });
}
