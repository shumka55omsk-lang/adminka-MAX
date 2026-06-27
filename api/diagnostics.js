import { getMaxApiBaseUrl, getTlsInfo, maskToken, maxFetch, requireAdmin, serializeFetchError } from './_max.js';
import { getSupabaseClient } from './_supabase.js';

function envInfo(req) {
  const token = String(process.env.MAX_BOT_TOKEN || '').trim();
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || '').trim();
  const webhookSecret = String(process.env.MAX_WEBHOOK_SECRET || '').trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const detectedBaseUrl = `${proto}://${host}`.replace(/\/+$/, '');

  return {
    maxApiBaseUrl: getMaxApiBaseUrl(),
    tls: getTlsInfo(),
    hasMaxToken: Boolean(token),
    maxTokenMasked: maskToken(token),
    maxTokenLength: token.length || 0,
    publicBaseUrl: publicBaseUrl || null,
    detectedBaseUrl,
    webhookUrl: `${(publicBaseUrl || detectedBaseUrl).replace(/\/+$/, '')}/api/max-webhook`,
    hasWebhookSecret: Boolean(webhookSecret),
    webhookSecretLength: webhookSecret.length || 0,
    webhookSecretValid: !webhookSecret || /^[a-zA-Z0-9_-]{5,256}$/.test(webhookSecret),
    hasSupabaseUrl: Boolean(String(process.env.SUPABASE_URL || '').trim()),
    hasSupabaseServiceRoleKey: Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim())
  };
}

async function runMaxTest(path, method = 'GET') {
  try {
    const result = await maxFetch(path, { method, timeoutMs: 15000 });
    return {
      ok: result.ok,
      status: result.status,
      baseUrl: result.baseUrl,
      data: result.data
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl: error.baseUrl || getMaxApiBaseUrl(),
      error: error.message,
      details: error.details || serializeFetchError(error)
    };
  }
}

async function runSupabaseTest() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return { ok: false, skipped: true, error: 'Supabase не настроен' };
    const { data, error } = await supabase
      .from('max_groups')
      .select('id')
      .limit(1);
    if (error) return { ok: false, error: error.message, details: error };
    return { ok: true, rowsVisible: Array.isArray(data) ? data.length : 0 };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!requireAdmin(req, res)) return;

    const env = envInfo(req);
    const maxMe = await runMaxTest('/me');
    const maxSubscriptions = await runMaxTest('/subscriptions');
    const supabase = await runSupabaseTest();

    return res.status(200).json({
      ok: maxMe.ok && supabase.ok,
      checkedAt: new Date().toISOString(),
      env,
      tests: {
        maxMe,
        maxSubscriptions,
        supabase
      },
      hints: [
        'Если maxMe показывает fetch failed, проблема в соединении Vercel → MAX API, а не в Supabase.',
        'Если maxMe показывает UNABLE_TO_GET_ISSUER_CERT_LOCALLY, Node/Vercel не доверяет цепочке сертификатов MAX API.',
        'Самый быстрый тест: MAX_API_BASE_URL=https://platform-api.max.ru и Redeploy.',
        'Если нужен platform-api2.max.ru: добавь официальный CA в MAX_CA_CERT_PEM / MAX_CA_CERT_BASE64 или временно поставь MAX_TLS_MODE=insecure только для теста.',
        'MAX_WEBHOOK_SECRET должен быть 5–256 символов: A-Z, a-z, 0-9, underscore или дефис.'
      ]
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, details: serializeFetchError(error) });
  }
}
