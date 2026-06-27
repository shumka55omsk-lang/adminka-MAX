import { requireAdmin } from './_max.js';
import { hasSupabase, supabaseFetch } from './_supabase.js';

export default async function handler(req, res) {
  try {
    if (!['GET', 'DELETE'].includes(req.method)) {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (!requireAdmin(req, res)) return;

    if (!hasSupabase()) {
      return res.status(200).json({ ok: true, storage: 'local', history: [] });
    }

    if (req.method === 'GET') {
      const limit = Math.min(Math.max(Number(req.query?.limit || 50), 1), 200);
      const rows = await supabaseFetch(`max_send_logs?select=id,chat_id,post_text,buttons,has_image,ok,status,response,sent_at&order=sent_at.desc&limit=${limit}`, {
        method: 'GET'
      });
      return res.status(200).json({ ok: true, storage: 'supabase', history: Array.isArray(rows) ? rows : [] });
    }

    if (req.method === 'DELETE') {
      // Удаляем только последние 1000 строк, чтобы случайно не делать тяжёлые операции на большой базе.
      const rows = await supabaseFetch('max_send_logs?select=id&order=sent_at.desc&limit=1000', { method: 'GET' });
      const ids = (Array.isArray(rows) ? rows : []).map((row) => row.id).filter(Boolean);
      if (!ids.length) return res.status(200).json({ ok: true, deleted: 0 });

      await supabaseFetch(`max_send_logs?id=in.(${ids.map(encodeURIComponent).join(',')})`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      return res.status(200).json({ ok: true, deleted: ids.length });
    }
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
