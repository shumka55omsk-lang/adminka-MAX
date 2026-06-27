import { requireAdmin, serializeFetchError } from './_max.js';
import { hasSupabase, supabaseFetch, escapePostgrestValue } from './_supabase.js';

export default async function handler(req, res) {
  try {
    if (!requireAdmin(req, res)) return;

    if (!hasSupabase()) {
      return res.status(400).json({ ok: false, error: 'Supabase не настроен' });
    }

    if (req.method === 'GET') {
      const data = await supabaseFetch('max_scheduled_posts?select=id,post_text,chat_ids,group_names,buttons,has_image,scheduled_at,status,sent_at,last_error,attempt_count,result,created_at&order=scheduled_at.asc&limit=100');
      return res.status(200).json({ ok: true, scheduled: data || [] });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) return res.status(400).json({ ok: false, error: 'Не передан id запланированного поста' });

      const data = await supabaseFetch(`max_scheduled_posts?id=eq.${escapePostgrestValue(id)}&status=eq.scheduled`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ status: 'cancelled', last_error: 'Отменено из админки' })
      });

      return res.status(200).json({ ok: true, cancelled: data?.length || 0, data });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, details: serializeFetchError(error) });
  }
}
