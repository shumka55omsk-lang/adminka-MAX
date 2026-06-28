import { requireAdmin } from './_max.js';
import { hasSupabase, supabaseFetch } from './_supabase.js';

function normalizeText(value) {
  return String(value || '').trim();
}

function numberOrZero(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function pickGroupFromUrl(url) {
  try {
    const parsed = new URL(String(url || ''), 'https://x.local');
    return normalizeText(parsed.searchParams.get('ref_chat_id') || parsed.searchParams.get('chat_id') || parsed.searchParams.get('group_id'));
  } catch {
    return '';
  }
}

function countSentByGroup(logs = []) {
  const map = new Map();
  for (const log of logs) {
    const rows = Array.isArray(log.results) ? log.results : [];
    for (const row of rows) {
      const chatId = normalizeText(row.chatId || row.chat_id);
      if (!chatId) continue;
      const item = map.get(chatId) || { posts: 0, ok: 0, failed: 0, lastError: '', lastSentAt: null };
      item.posts += 1;
      if (row.ok) item.ok += 1; else item.failed += 1;
      if (!row.ok) item.lastError = JSON.stringify(row.data || row.error || '').slice(0, 300);
      item.lastSentAt = log.created_at || item.lastSentAt;
      map.set(chatId, item);
    }
  }
  return map;
}

function addCounter(map, key, field, value = 1) {
  if (!key) return;
  const item = map.get(key) || { visits: 0, leads: 0, total: 0 };
  item[field] = numberOrZero(item[field]) + value;
  map.set(key, item);
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!hasSupabase()) return res.status(400).json({ ok: false, error: 'Supabase не настроен' });

  try {
    const [groups, logs, visits, leads] = await Promise.all([
      supabaseFetch('max_groups?select=name,chat_id,active,source,last_update_type,updated_at&order=name.asc&limit=500').catch(() => []),
      supabaseFetch('max_send_logs?select=created_at,results&order=created_at.desc&limit=500').catch(() => []),
      supabaseFetch('max_miniapp_visits?select=created_at,ref_chat_id,utm_campaign,utm_content,landing_url&order=created_at.desc&limit=2000').catch(() => []),
      supabaseFetch('max_miniapp_leads?select=created_at,ref_chat_id,utm_campaign,utm_content,landing_url,estimated_total&order=created_at.desc&limit=1000').catch(() => [])
    ]);

    const sentMap = countSentByGroup(Array.isArray(logs) ? logs : []);
    const metricMap = new Map();

    for (const visit of Array.isArray(visits) ? visits : []) {
      const key = normalizeText(visit.ref_chat_id) || pickGroupFromUrl(visit.landing_url);
      addCounter(metricMap, key, 'visits', 1);
    }
    for (const lead of Array.isArray(leads) ? leads : []) {
      const key = normalizeText(lead.ref_chat_id) || pickGroupFromUrl(lead.landing_url);
      addCounter(metricMap, key, 'leads', 1);
      addCounter(metricMap, key, 'total', numberOrZero(lead.estimated_total));
    }

    const rows = (Array.isArray(groups) ? groups : []).map((g) => {
      const chatId = normalizeText(g.chat_id);
      const sent = sentMap.get(chatId) || { posts: 0, ok: 0, failed: 0, lastError: '', lastSentAt: null };
      const metrics = metricMap.get(chatId) || { visits: 0, leads: 0, total: 0 };
      const conversion = metrics.visits > 0 ? Number(((metrics.leads / metrics.visits) * 100).toFixed(1)) : 0;
      return {
        name: g.name || `Группа ${chatId}`,
        chat_id: chatId,
        active: g.active !== false,
        source: g.source || '',
        posts: sent.posts,
        ok: sent.ok,
        failed: sent.failed,
        visits: metrics.visits,
        leads: metrics.leads,
        conversion,
        estimated_total: Math.round(metrics.total || 0),
        last_error: sent.lastError,
        last_sent_at: sent.lastSentAt,
        updated_at: g.updated_at || null
      };
    }).sort((a, b) => (b.leads - a.leads) || (b.visits - a.visits) || (b.posts - a.posts));

    return res.status(200).json({ ok: true, groups: rows, summary: {
      groups: rows.length,
      visits: rows.reduce((s, x) => s + x.visits, 0),
      leads: rows.reduce((s, x) => s + x.leads, 0),
      posts: rows.reduce((s, x) => s + x.posts, 0),
      estimated_total: rows.reduce((s, x) => s + x.estimated_total, 0)
    }});
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
