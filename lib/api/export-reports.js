import { requireAdmin } from './_max.js';
import { hasSupabase, supabaseFetch } from './_supabase.js';

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
  return `"${text}"`;
}

function toCsv(headers, rows) {
  return [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))].join('\n');
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send('\ufeff' + csv);
}

function normalizeType(value) {
  const type = String(value || 'leads').trim().toLowerCase();
  return ['leads', 'campaigns', 'groups'].includes(type) ? type : 'leads';
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!hasSupabase()) return res.status(400).json({ ok: false, error: 'Supabase не настроен' });

  try {
    const type = normalizeType(req.query?.type);
    if (type === 'leads') {
      const rows = await supabaseFetch('max_miniapp_leads?select=id,created_at,crm_status,name,phone,address,object_type,area_m2,estimated_total,utm_campaign,utm_content,source,crm_note,crm_next_action&order=created_at.desc&limit=5000');
      const headers = ['id','created_at','crm_status','name','phone','address','object_type','area_m2','estimated_total','utm_campaign','utm_content','source','crm_note','crm_next_action'];
      return sendCsv(res, 'max-miniapp-leads.csv', toCsv(headers, Array.isArray(rows) ? rows : []));
    }

    if (type === 'campaigns') {
      const leads = await supabaseFetch('max_miniapp_leads?select=utm_campaign,utm_content,source,estimated_total&limit=5000').catch(() => []);
      const visits = await supabaseFetch('max_miniapp_visits?select=utm_campaign,utm_content,source&limit=5000').catch(() => []);
      const map = new Map();
      for (const v of Array.isArray(visits) ? visits : []) {
        const key = `${v.utm_campaign || 'без кампании'}|${v.utm_content || ''}|${v.source || ''}`;
        const item = map.get(key) || { utm_campaign: v.utm_campaign || 'без кампании', utm_content: v.utm_content || '', source: v.source || '', visits: 0, leads: 0, estimated_total: 0 };
        item.visits += 1;
        map.set(key, item);
      }
      for (const l of Array.isArray(leads) ? leads : []) {
        const key = `${l.utm_campaign || 'без кампании'}|${l.utm_content || ''}|${l.source || ''}`;
        const item = map.get(key) || { utm_campaign: l.utm_campaign || 'без кампании', utm_content: l.utm_content || '', source: l.source || '', visits: 0, leads: 0, estimated_total: 0 };
        item.leads += 1;
        item.estimated_total += Number(l.estimated_total || 0);
        map.set(key, item);
      }
      const rows = Array.from(map.values()).map((x) => ({ ...x, conversion: x.visits ? ((x.leads / x.visits) * 100).toFixed(1) + '%' : '0%' }));
      const headers = ['utm_campaign','utm_content','source','visits','leads','conversion','estimated_total'];
      return sendCsv(res, 'max-campaigns-report.csv', toCsv(headers, rows));
    }

    const groups = await supabaseFetch('max_groups?select=name,chat_id,active,source,last_update_type,updated_at&order=name.asc&limit=2000').catch(() => []);
    const headers = ['name','chat_id','active','source','last_update_type','updated_at'];
    return sendCsv(res, 'max-groups-report.csv', toCsv(headers, Array.isArray(groups) ? groups : []));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
