export function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseBaseUrl() {
  return String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

export function supabaseHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };
}

function buildHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };
}

async function fetchSupabaseRest({ baseUrl, serviceKey, path, options = {}, missingMessage }) {
  if (!baseUrl || !serviceKey) {
    throw new Error(missingMessage || 'Supabase не настроен. Проверьте URL и SERVICE_ROLE_KEY.');
  }

  const url = `${String(baseUrl).replace(/\/$/, '')}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(serviceKey, options.headers || {})
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!response.ok) {
    const details = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`Supabase error ${response.status}: ${details}`);
  }

  return data;
}

export async function supabaseFetch(path, options = {}) {
  return fetchSupabaseRest({
    baseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    path,
    options,
    missingMessage: 'Supabase не настроен. Добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.'
  });
}

export function hasCrmSupabase() {
  return Boolean(process.env.CRM_SUPABASE_URL && process.env.CRM_SUPABASE_SERVICE_ROLE_KEY);
}

export function getCrmSupabaseBaseUrl() {
  return String(process.env.CRM_SUPABASE_URL || '').replace(/\/$/, '');
}

export async function crmSupabaseFetch(path, options = {}) {
  return fetchSupabaseRest({
    baseUrl: process.env.CRM_SUPABASE_URL,
    serviceKey: process.env.CRM_SUPABASE_SERVICE_ROLE_KEY,
    path,
    options,
    missingMessage: 'CRM Supabase не настроен. Добавьте CRM_SUPABASE_URL и CRM_SUPABASE_SERVICE_ROLE_KEY из проекта CRM мягких окон.'
  });
}

export function escapePostgrestValue(value) {
  return encodeURIComponent(String(value));
}
