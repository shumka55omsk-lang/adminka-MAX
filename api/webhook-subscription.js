import { getMaxApiBaseUrl, authHeaders, requireAdmin, requireToken } from './_max.js';

const DEFAULT_UPDATE_TYPES = [
  'bot_added',
  'bot_removed',
  'chat_title_changed',
  'message_created'
];

function getBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL;
  if (configured) {
    return configured.startsWith('http') ? configured.replace(/\/$/, '') : `https://${configured.replace(/\/$/, '')}`;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`.replace(/\/$/, '');
}

async function maxRequest(path, options = {}) {
  const response = await fetch(`${getMaxApiBaseUrl()}${path}`, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`MAX API ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!requireAdmin(req, res)) return;
    if (!requireToken(res)) return;

    if (req.method === 'GET') {
      const data = await maxRequest('/subscriptions', { method: 'GET' });
      return res.status(200).json({ ok: true, data });
    }

    const body = req.body || {};
    const url = body.url || `${getBaseUrl(req)}/api/max-webhook`;
    const update_types = Array.isArray(body.update_types) && body.update_types.length
      ? body.update_types
      : DEFAULT_UPDATE_TYPES;
    const payload = { url, update_types };

    if (process.env.MAX_WEBHOOK_SECRET) {
      payload.secret = process.env.MAX_WEBHOOK_SECRET;
    }

    const data = await maxRequest('/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return res.status(200).json({ ok: true, payload, data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
