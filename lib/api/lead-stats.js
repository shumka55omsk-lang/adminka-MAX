import { requireAdmin } from './_max.js';
import { supabaseFetch } from './_supabase.js';

function getNested(obj, path, fallback = '') {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj) ?? fallback;
}

function pickString(value, fallback = '') {
  return String(value || fallback || '').trim().slice(0, 180);
}

function buildStats(leads = []) {
  const map = new Map();
  for (const lead of leads) {
    const raw = lead.raw_payload || {};
    const attr = raw.attribution || {};
    const source = pickString(lead.source || attr.source || attr.utm_source, 'unknown');
    const medium = pickString(lead.utm_medium || attr.utm_medium, '');
    const campaign = pickString(lead.utm_campaign || attr.utm_campaign, 'без кампании');
    const content = pickString(lead.utm_content || attr.utm_content, '');
    const key = [source, medium, campaign, content].join('|');
    const total = Number(lead.estimated_total || raw.estimate?.total || 0) || 0;
    const createdAt = lead.created_at || '';
    if (!map.has(key)) {
      map.set(key, {
        source,
        medium,
        campaign,
        content,
        count: 0,
        estimated_total_sum: 0,
        last_created_at: createdAt
      });
    }
    const item = map.get(key);
    item.count += 1;
    item.estimated_total_sum += total;
    if (createdAt && (!item.last_created_at || new Date(createdAt) > new Date(item.last_created_at))) {
      item.last_created_at = createdAt;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || String(b.last_created_at).localeCompare(String(a.last_created_at)));
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const limit = Math.min(1000, Math.max(1, Number(req.query?.limit || 300)));
    let leads = [];
    try {
      leads = await supabaseFetch(`max_miniapp_leads?select=id,created_at,estimated_total,source,utm_source,utm_medium,utm_campaign,utm_content,utm_term,raw_payload&order=created_at.desc&limit=${limit}`);
    } catch (error) {
      leads = await supabaseFetch(`max_miniapp_leads?select=id,created_at,estimated_total,raw_payload&order=created_at.desc&limit=${limit}`);
    }
    return res.status(200).json({ ok: true, items: buildStats(Array.isArray(leads) ? leads : []), leadsCount: Array.isArray(leads) ? leads.length : 0 });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
