const DEFAULT_MAX_API_BASE_URL = 'https://platform-api2.max.ru';

export function getMaxApiBaseUrl() {
  return String(process.env.MAX_API_BASE_URL || DEFAULT_MAX_API_BASE_URL).trim().replace(/\/+$/, '');
}

export function maskToken(token = '') {
  const value = String(token || '');
  if (!value) return '';
  if (value.length <= 10) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function authHeaders(extra = {}) {
  return {
    Authorization: String(process.env.MAX_BOT_TOKEN || '').trim(),
    ...extra
  };
}

export function requireAdmin(req, res) {
  const adminPassword = req.headers['x-admin-password'];
  if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, error: 'Неверный пароль админки' });
    return false;
  }
  return true;
}

export function requireToken(res) {
  if (!String(process.env.MAX_BOT_TOKEN || '').trim()) {
    res.status(500).json({ ok: false, error: 'Не задан MAX_BOT_TOKEN' });
    return false;
  }
  return true;
}

export function serializeFetchError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    code: error?.code || error?.cause?.code || null,
    causeName: error?.cause?.name || null,
    causeMessage: error?.cause?.message || null,
    causeCode: error?.cause?.code || null,
    stackHead: String(error?.stack || '').split('\n').slice(0, 3).join('\n')
  };
}

export async function maxFetch(path, options = {}) {
  const baseUrl = getMaxApiBaseUrl();
  const timeoutMs = options.timeoutMs || 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: authHeaders(options.headers || {})
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 1200) };
    }
    return { ok: response.ok, status: response.status, data, baseUrl };
  } catch (error) {
    const details = serializeFetchError(error);
    const hint = details.name === 'AbortError'
      ? 'Тайм-аут запроса к MAX API. Проверь доступность домена MAX из Vercel.'
      : 'Vercel не смог установить сетевое соединение с MAX API. Чаще всего причина: домен API, TLS/сертификат, DNS или сетевой доступ.';

    const wrapped = new Error(`${hint} Детали: ${details.message}`);
    wrapped.details = details;
    wrapped.baseUrl = baseUrl;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}
