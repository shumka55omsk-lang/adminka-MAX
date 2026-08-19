export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v50-crm-opening-checkbox-fix',
    builtAt: '2026-08-19T16:07:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Fix CRM dashboard total: pass legacy gluhie/openable checkbox flags into calculation items'
  });
}
