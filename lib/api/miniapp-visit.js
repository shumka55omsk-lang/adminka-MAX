import { supabaseFetch, hasSupabase } from './_supabase.js';
import { validateMaxWebAppData } from './_maxWebApp.js';

function sanitizeText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function compactNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAttribution(value = {}) {
  const a = value && typeof value === 'object' ? value : {};
  return {
    source: sanitizeText(a.source || a.utm_source || 'max_miniapp', 160),
    utm_source: sanitizeText(a.utm_source || a.source || 'max_miniapp', 160),
    utm_medium: sanitizeText(a.utm_medium, 160),
    utm_campaign: sanitizeText(a.utm_campaign, 160),
    utm_content: sanitizeText(a.utm_content, 160),
    utm_term: sanitizeText(a.utm_term, 160),
    ref_chat_id: sanitizeText(a.ref_chat_id, 160),
    landing_url: sanitizeText(a.landing_url, 1000)
  };
}

function getUser(validation, unsafe = {}) {
  return validation.user || unsafe?.user || null;
}

function getChat(validation, unsafe = {}) {
  return validation.chat || unsafe?.chat || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    if (!hasSupabase()) return res.status(200).json({ ok: true, saved: false, reason: 'Supabase not configured' });

    const body = req.body || {};
    const initData = sanitizeText(body.initData, 10000);
    const validation = validateMaxWebAppData(initData, process.env.MAX_BOT_TOKEN);
    const unsafe = body.initDataUnsafe || {};
    const user = getUser(validation, unsafe);
    const chat = getChat(validation, unsafe);
    const attribution = normalizeAttribution(body.attribution || {});
    const device = body.device && typeof body.device === 'object' ? body.device : {};

    const visitorId = sanitizeText(body.visitorId, 120) || `anon_${Date.now()}`;
    const visitId = sanitizeText(body.visitId, 160) || `${visitorId}_${Date.now()}`;
    const eventType = sanitizeText(body.eventType || 'miniapp_open', 80);

    const visitRow = {
      visit_id: visitId,
      visitor_id: visitorId,
      event_type: eventType,
      max_user_id: compactNumber(user?.id),
      max_username: sanitizeText(user?.username, 180),
      max_first_name: sanitizeText(user?.first_name, 180),
      max_last_name: sanitizeText(user?.last_name, 180),
      max_chat_id: compactNumber(chat?.id),
      source: attribution.source || null,
      utm_source: attribution.utm_source || null,
      utm_medium: attribution.utm_medium || null,
      utm_campaign: attribution.utm_campaign || null,
      utm_content: attribution.utm_content || null,
      utm_term: attribution.utm_term || null,
      ref_chat_id: attribution.ref_chat_id || null,
      landing_url: attribution.landing_url || sanitizeText(body.landingUrl, 1000) || null,
      referrer: sanitizeText(body.referrer, 1000) || null,
      init_data_valid: validation.ok,
      validation_reason: validation.reason,
      user_agent: sanitizeText(req.headers['user-agent'], 500),
      device_info: device,
      raw_payload: body
    };

    let visit = null;
    let audience = null;
    try {
      visit = await supabaseFetch('max_miniapp_visits?on_conflict=visit_id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(visitRow)
      });
    } catch (error) {
      if (!String(error.message || '').includes('Could not find') && !String(error.message || '').includes('PGRST204')) throw error;
      return res.status(200).json({ ok: true, saved: false, warning: 'Run supabase/hotfix-miniapp-audience.sql', error: error.message });
    }

    try {
      audience = await supabaseFetch('max_miniapp_audience?on_conflict=visitor_id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          visitor_id: visitorId,
          first_visit_id: visitId,
          last_visit_id: visitId,
          max_user_id: compactNumber(user?.id),
          max_username: sanitizeText(user?.username, 180),
          max_first_name: sanitizeText(user?.first_name, 180),
          max_last_name: sanitizeText(user?.last_name, 180),
          source: attribution.source || null,
          utm_source: attribution.utm_source || null,
          utm_medium: attribution.utm_medium || null,
          utm_campaign: attribution.utm_campaign || null,
          utm_content: attribution.utm_content || null,
          landing_url: attribution.landing_url || sanitizeText(body.landingUrl, 1000) || null,
          init_data_valid: validation.ok,
          ad_consent: bool(body.adConsent),
          raw_payload: body,
          last_seen_at: new Date().toISOString()
        })
      });
    } catch (error) {
      audience = { ok: false, error: error.message };
    }

    return res.status(200).json({ ok: true, saved: true, visit, audience });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
