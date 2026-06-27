import { requireAdmin } from './_max.js';
import { supabaseFetch } from './_supabase.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 50)));
    const leads = await supabaseFetch(`max_miniapp_leads?select=*&order=created_at.desc&limit=${limit}`, {
      method: 'GET'
    });
    return res.status(200).json({ ok: true, leads });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
