export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v41-crm-sizes-visible',
    builtAt: '2026-08-18T16:58:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Estimate leads from MAX mini app sync to soft-windows CRM with visible dimensions in history and calculation JSON'
  });
}
