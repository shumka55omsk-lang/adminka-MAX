import crypto from 'crypto';
import { requireAdmin } from './_max.js';
import { supabaseFetch } from './_supabase.js';

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (digits.length === 10) digits = '7' + digits;
  if (!digits || digits.length < 10) return '';
  return digits;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex');
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r;]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const format = String(req.query?.format || 'plain').toLowerCase() === 'sha256' ? 'sha256' : 'plain';
    const requireConsent = String(req.query?.require_consent ?? 'true').toLowerCase() !== 'false';
    const limit = Math.min(20000, Math.max(1, Number(req.query?.limit || 10000)));

    let leads = [];
    try {
      leads = await supabaseFetch(`max_miniapp_leads?select=id,created_at,name,phone,ad_consent,utm_campaign,utm_content,raw_payload&order=created_at.desc&limit=${limit}`);
    } catch {
      leads = await supabaseFetch(`max_miniapp_leads?select=id,created_at,name,phone,utm_campaign,utm_content,raw_payload&order=created_at.desc&limit=${limit}`);
    }

    const seen = new Set();
    const rows = [];
    for (const lead of Array.isArray(leads) ? leads : []) {
      const phone = normalizePhone(lead.phone || lead.raw_payload?.phone || lead.raw_payload?.form?.phone);
      if (!phone || seen.has(phone)) continue;
      const consent = lead.ad_consent === true || lead.raw_payload?.consent?.adConsent === true;
      if (requireConsent && !consent) continue;
      seen.add(phone);
      rows.push({
        phone,
        phone_sha256: sha256(phone),
        name: lead.name || lead.raw_payload?.form?.name || '',
        utm_campaign: lead.utm_campaign || lead.raw_payload?.attribution?.utm_campaign || '',
        utm_content: lead.utm_content || lead.raw_payload?.attribution?.utm_content || '',
        created_at: lead.created_at || ''
      });
    }

    const header = format === 'sha256'
      ? ['phone_sha256','name','utm_campaign','utm_content','created_at']
      : ['phone','name','utm_campaign','utm_content','created_at'];
    const csv = [header.join(';')]
      .concat(rows.map((row) => header.map((key) => csvEscape(row[key])).join(';')))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="yandex-audience-${format}-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.status(200).send('\ufeff' + csv);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
