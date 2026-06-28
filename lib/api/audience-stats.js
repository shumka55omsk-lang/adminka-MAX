import { requireAdmin } from './_max.js';
import { supabaseFetch } from './_supabase.js';

function s(value, fallback = '') { return String(value || fallback || '').trim(); }

function groupByCampaign(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const source = s(row.source || row.raw_payload?.attribution?.source, 'unknown');
    const medium = s(row.utm_medium || row.raw_payload?.attribution?.utm_medium, '');
    const campaign = s(row.utm_campaign || row.raw_payload?.attribution?.utm_campaign, 'без кампании');
    const content = s(row.utm_content || row.raw_payload?.attribution?.utm_content, '');
    const key = [source, medium, campaign, content].join('|');
    if (!map.has(key)) map.set(key, { source, medium, campaign, content, visits: 0, unique_visitors: new Set(), max_users: new Set(), last_seen_at: '' });
    const item = map.get(key);
    item.visits += 1;
    if (row.visitor_id) item.unique_visitors.add(row.visitor_id);
    if (row.max_user_id) item.max_users.add(row.max_user_id);
    const date = row.created_at || row.last_seen_at || '';
    if (date && (!item.last_seen_at || new Date(date) > new Date(item.last_seen_at))) item.last_seen_at = date;
  }
  return Array.from(map.values()).map((x) => ({ ...x, unique_visitors: x.unique_visitors.size, max_users: x.max_users.size })).sort((a, b) => b.visits - a.visits);
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const limit = Math.min(5000, Math.max(1, Number(req.query?.limit || 1000)));
    let visits = [];
    let visitWarning = null;
    try {
      visits = await supabaseFetch(`max_miniapp_visits?select=created_at,visitor_id,max_user_id,source,utm_source,utm_medium,utm_campaign,utm_content,raw_payload&order=created_at.desc&limit=${limit}`);
    } catch (error) {
      visitWarning = error.message;
      visits = [];
    }

    let leads = [];
    try {
      leads = await supabaseFetch(`max_miniapp_leads?select=id,created_at,phone,ad_consent,source,utm_campaign,utm_content,raw_payload&order=created_at.desc&limit=${limit}`);
    } catch (error) {
      leads = await supabaseFetch(`max_miniapp_leads?select=id,created_at,phone,raw_payload&order=created_at.desc&limit=${limit}`);
    }

    const uniqueVisitors = new Set(visits.map((v) => v.visitor_id).filter(Boolean));
    const maxUsers = new Set(visits.map((v) => v.max_user_id).filter(Boolean));
    const leadsWithPhone = leads.filter((l) => String(l.phone || '').trim());
    const adReady = leadsWithPhone.filter((l) => l.ad_consent === true || l.raw_payload?.consent?.adConsent === true);

    return res.status(200).json({
      ok: true,
      totals: {
        visits: visits.length,
        unique_visitors: uniqueVisitors.size,
        max_users: maxUsers.size,
        leads: leads.length,
        leads_with_phone: leadsWithPhone.length,
        yandex_ready_contacts: adReady.length
      },
      campaigns: groupByCampaign(visits),
      visitWarning
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
