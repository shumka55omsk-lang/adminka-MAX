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

export async function supabaseFetch(path, options = {}) {
  if (!hasSupabase()) {
    throw new Error('Supabase не настроен. Добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.');
  }

  const url = `${getSupabaseBaseUrl()}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: supabaseHeaders(options.headers || {})
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

export function escapePostgrestValue(value) {
  return encodeURIComponent(String(value));
}
