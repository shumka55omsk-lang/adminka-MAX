import { hasSupabase, supabaseFetch } from './_supabase.js';

export async function saveSendLogs({ text, buttons, chatIds, results, hasImage }) {
  if (!hasSupabase()) return { saved: false, reason: 'supabase_not_configured' };

  const now = new Date().toISOString();
  const rows = (results || []).map((result) => ({
    chat_id: Number(result.chatId),
    post_text: String(text || '').slice(0, 4000),
    buttons: Array.isArray(buttons) ? buttons : [],
    has_image: Boolean(hasImage),
    ok: Boolean(result.ok),
    status: Number(result.status || 0),
    response: result.data || result,
    sent_at: now
  }));

  if (!rows.length && Array.isArray(chatIds)) {
    for (const chatId of chatIds) {
      rows.push({
        chat_id: Number(chatId),
        post_text: String(text || '').slice(0, 4000),
        buttons: Array.isArray(buttons) ? buttons : [],
        has_image: Boolean(hasImage),
        ok: false,
        status: 0,
        response: { error: 'No result' },
        sent_at: now
      });
    }
  }

  if (!rows.length) return { saved: false, reason: 'no_rows' };

  const data = await supabaseFetch('max_send_logs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(rows)
  });

  return { saved: true, count: rows.length, data };
}
