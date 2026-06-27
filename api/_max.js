export function getMaxApiBaseUrl() {
  return (process.env.MAX_API_BASE_URL || 'https://platform-api2.max.ru').replace(/\/$/, '');
}

export function authHeaders(extra = {}) {
  return {
    Authorization: process.env.MAX_BOT_TOKEN,
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
  if (!process.env.MAX_BOT_TOKEN) {
    res.status(500).json({ ok: false, error: 'Не задан MAX_BOT_TOKEN' });
    return false;
  }
  return true;
}
