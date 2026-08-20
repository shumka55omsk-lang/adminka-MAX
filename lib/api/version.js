export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v55-scheduled-posting-cron-fix',
    builtAt: '2026-08-20T13:18:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Enable Vercel Cron for scheduled MAX posts and keep manual scheduler check in admin'
  });
}
