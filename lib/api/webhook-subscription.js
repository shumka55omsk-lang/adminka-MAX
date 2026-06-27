import { maxFetch, requireAdmin, requireToken, serializeFetchError } from './_max.js';

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
  const result = await maxFetch(path, options);
  if (!result.ok) {
    throw new Error(`MAX API ${result.status}: ${JSON.stringify(result.data)}`);
  }
  return result.data;
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
    return res.status(500).json({ ok: false, error: error.message, baseUrl: error.baseUrl || null, details: error.details || serializeFetchError(error) });
  }
}
