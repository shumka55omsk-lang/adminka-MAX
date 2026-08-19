export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v49-fixed-v48-dashboard-total',
    builtAt: '2026-08-19T15:35:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Fixed v48 archive: catch-all API version now matches CRM dashboard total JSON logic for soft-windows CRM'
  });
}
