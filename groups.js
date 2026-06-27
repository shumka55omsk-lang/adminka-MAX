import crypto from 'crypto';

function decodeValue(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'));
  } catch {
    return String(value || '');
  }
}

export function validateMaxWebAppData(initData, botToken) {
  const raw = String(initData || '').trim();
  const token = String(botToken || '').trim();

  if (!raw) {
    return { ok: false, reason: 'empty_init_data' };
  }
  if (!token) {
    return { ok: false, reason: 'missing_bot_token' };
  }

  const pairs = raw.split('&').filter(Boolean).map((part) => {
    const eq = part.indexOf('=');
    if (eq === -1) return [part, ''];
    return [part.slice(0, eq), part.slice(eq + 1)];
  });

  const keyCounts = new Map();
  for (const [key] of pairs) {
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }

  const hashCount = keyCounts.get('hash') || 0;
  if (hashCount !== 1) {
    return { ok: false, reason: 'hash_count_invalid', hashCount };
  }

  for (const [key, count] of keyCounts.entries()) {
    if (count !== 1) {
      return { ok: false, reason: 'duplicate_key', key };
    }
  }

  const decoded = pairs.map(([key, value]) => [key, decodeValue(value)]);
  const originalHash = decoded.find(([key]) => key === 'hash')?.[1];
  if (!originalHash) {
    return { ok: false, reason: 'missing_hash' };
  }

  const launchParams = decoded
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(launchParams)
    .digest('hex');

  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(calculatedHash, 'hex'), Buffer.from(originalHash, 'hex'));
  } catch {
    valid = calculatedHash === originalHash;
  }

  let user = null;
  let chat = null;
  let authDate = null;
  for (const [key, value] of decoded) {
    if (key === 'user') {
      try { user = JSON.parse(value); } catch { user = null; }
    }
    if (key === 'chat') {
      try { chat = JSON.parse(value); } catch { chat = null; }
    }
    if (key === 'auth_date') authDate = Number(value) || null;
  }

  return {
    ok: valid,
    reason: valid ? 'valid' : 'hash_mismatch',
    user,
    chat,
    authDate,
    calculatedHash: valid ? undefined : calculatedHash,
    launchParams: valid ? undefined : launchParams
  };
}

export function isMaxAuthFresh(authDate, maxAgeSeconds = 3600) {
  if (!authDate) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - Number(authDate)) <= maxAgeSeconds;
}
