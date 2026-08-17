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

function decodeBase64Url(value) {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function normalizeFlow(value) {
  const flow = String(value || '').trim().toLowerCase();
  return flow === 'estimate' || flow === 'measure' ? flow : '';
}

function parseLaunchPayload(rawPayload) {
  const payload = String(rawPayload || '').trim();
  if (!payload) return {};

  if (payload.startsWith('m_')) {
    try {
      const parsed = JSON.parse(decodeBase64Url(payload.slice(2)) || '{}');
      return {
        flow: normalizeFlow(parsed.f || parsed.flow || parsed.mode),
        campaign: sanitizeText(parsed.c || parsed.campaign, 160),
        content: sanitizeText(parsed.p || parsed.content, 160),
        medium: sanitizeText(parsed.m || parsed.medium, 160)
      };
    } catch {
      return {};
    }
  }

  if (payload.includes('=')) {
    try {
      const params = new URLSearchParams(payload.replace(/^#/, '').replace(/^\?/, ''));
      return {
        flow: normalizeFlow(params.get('f') || params.get('flow') || params.get('mode')),
        campaign: sanitizeText(params.get('c') || params.get('utm_campaign') || params.get('campaign'), 160),
        content: sanitizeText(params.get('p') || params.get('utm_content') || params.get('content'), 160),
        medium: sanitizeText(params.get('m') || params.get('utm_medium') || params.get('medium'), 160)
      };
    } catch {
      return {};
    }
  }

  if (payload.includes('__')) {
    const result = {};
    payload.split('__').forEach((part) => {
      const index = part.indexOf('-');
      if (index <= 0) return;
      const key = part.slice(0, index);
      const value = part.slice(index + 1);
      if (key === 'f') result.flow = normalizeFlow(value);
      if (key === 'c') result.campaign = sanitizeText(value, 160);
      if (key === 'p') result.content = sanitizeText(value, 160);
      if (key === 'm') result.medium = sanitizeText(value, 160);
    });
    if (result.flow || result.campaign || result.content || result.medium) return result;
  }

  const tokens = payload.split('_');
  const getAfter = (key) => {
    const index = tokens.indexOf(key);
    return index >= 0 ? sanitizeText(tokens[index + 1], 160) : '';
  };
  return {
    flow: normalizeFlow(getAfter('f')),
    campaign: getAfter('c'),
    content: getAfter('p'),
    medium: getAfter('m')
  };
}

function getParamFromText(text, key) {
  try {
    const value = String(text || '').replace(/^#/, '').replace(/^\?/, '');
    if (!value || !value.includes('=')) return '';
    return sanitizeText(new URLSearchParams(value).get(key), 500);
  } catch {
    return '';
  }
}

function getLaunchPayloadFromBody(body = {}) {
  const unsafe = body.initDataUnsafe || {};
  const candidates = [
    body.openAppPayload,
    body.attribution?.open_app_payload,
    unsafe.start_param,
    unsafe.startParam,
    unsafe.payload,
    unsafe.start_payload,
    getParamFromText(body.initData, 'start_param'),
    getParamFromText(body.initData, 'startParam'),
    getParamFromText(body.initData, 'payload'),
    getParamFromText(body.landingUrl || body.attribution?.landing_url, 'start_param'),
    getParamFromText(body.landingUrl || body.attribution?.landing_url, 'payload')
  ];
  for (const item of candidates) {
    const value = sanitizeText(item, 500);
    if (value) return value;
  }
  return '';
}

function normalizeAttributionWithLaunch(value = {}, body = {}) {
  const base = normalizeAttribution(value);
  const parsed = parseLaunchPayload(getLaunchPayloadFromBody(body));
  const flow = parsed.flow || normalizeFlow(body.form?.leadMode);
  const campaign = base.utm_campaign || parsed.campaign || getParamFromText(base.landing_url, 'c') || getParamFromText(base.landing_url, 'utm_campaign');
  const rawContent = base.utm_content || parsed.content || getParamFromText(base.landing_url, 'p') || getParamFromText(base.landing_url, 'utm_content');
  const content = rawContent && flow && !rawContent.endsWith(`_${flow}`) ? `${rawContent}_${flow}` : rawContent;
  const medium = base.utm_medium || parsed.medium || getParamFromText(base.landing_url, 'm') || getParamFromText(base.landing_url, 'utm_medium') || (campaign || content ? 'max_group' : '');
  const source = base.source && base.source !== 'max_miniapp'
    ? base.source
    : (campaign || content ? 'max_group' : (base.source || 'max_miniapp'));

  return {
    ...base,
    source,
    utm_source: base.utm_source && base.utm_source !== 'max_miniapp' ? base.utm_source : source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: content,
    utm_term: base.utm_term || (flow === 'estimate' ? 'known_sizes' : (flow === 'measure' ? 'free_measure' : 'open_app')),
    open_app_payload: sanitizeText(getLaunchPayloadFromBody(body), 500)
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
    const attribution = normalizeAttributionWithLaunch(body.attribution || {}, body);
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
