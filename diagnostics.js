import { Agent } from 'undici';

const DEFAULT_MAX_API_BASE_URL = 'https://platform-api.max.ru';

let cachedDispatcher = null;
let cachedDispatcherKey = null;

export function getMaxApiBaseUrl() {
  return String(process.env.MAX_API_BASE_URL || DEFAULT_MAX_API_BASE_URL).trim().replace(/\/+$/, '');
}

export function getMaxTlsMode() {
  return String(process.env.MAX_TLS_MODE || 'default').trim().toLowerCase();
}

function getExtraCa() {
  const pem = String(process.env.MAX_CA_CERT_PEM || '').trim();
  if (pem) return pem.replace(/\\n/g, '\n');

  const base64 = String(process.env.MAX_CA_CERT_BASE64 || '').trim();
  if (base64) {
    try {
      return Buffer.from(base64, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }

  return '';
}

export function getTlsInfo() {
  const mode = getMaxTlsMode();
  const extraCa = getExtraCa();
  return {
    mode,
    hasExtraCa: Boolean(extraCa),
    extraCaLength: extraCa.length || 0,
    insecureEnabled: mode === 'insecure'
  };
}

function getDispatcher() {
  const tlsInfo = getTlsInfo();
  const key = `${tlsInfo.mode}:${tlsInfo.extraCaLength}`;
  if (cachedDispatcher && cachedDispatcherKey === key) return cachedDispatcher;

  cachedDispatcherKey = key;
  cachedDispatcher = null;

  if (tlsInfo.mode === 'insecure') {
    cachedDispatcher = new Agent({
      connect: {
        rejectUnauthorized: false
      }
    });
    return cachedDispatcher;
  }

  const ca = getExtraCa();
  if (ca) {
    cachedDispatcher = new Agent({
      connect: {
        ca
      }
    });
    return cachedDispatcher;
  }

  return null;
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

function buildFetchOptions(options = {}, withAuth = true) {
  const dispatcher = getDispatcher();
  const result = {
    ...options,
    headers: withAuth ? authHeaders(options.headers || {}) : (options.headers || {})
  };
  if (dispatcher) result.dispatcher = dispatcher;
  return result;
}

export async function fetchWithMaxTls(url, options = {}) {
  return fetch(url, buildFetchOptions(options, false));
}

export async function maxFetch(path, options = {}) {
  const baseUrl = getMaxApiBaseUrl();
  const timeoutMs = options.timeoutMs || 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...buildFetchOptions(options, true),
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 1200) };
    }
    return { ok: response.ok, status: response.status, data, baseUrl, tls: getTlsInfo() };
  } catch (error) {
    const details = serializeFetchError(error);
    const tlsInfo = getTlsInfo();
    const isCertError = ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(details.code || details.causeCode);
    const hint = details.name === 'AbortError'
      ? 'Тайм-аут запроса к MAX API. Проверь доступность домена MAX из Vercel.'
      : isCertError
        ? 'Vercel/Node не доверяет TLS-сертификату MAX API. Для platform-api2.max.ru нужен доверенный сертификат Минцифры или временный TLS-режим insecure.'
        : 'Vercel не смог установить сетевое соединение с MAX API. Чаще всего причина: домен API, TLS/сертификат, DNS или сетевой доступ.';

    const wrapped = new Error(`${hint} Детали: ${details.message}`);
    wrapped.details = details;
    wrapped.baseUrl = baseUrl;
    wrapped.tls = tlsInfo;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}
