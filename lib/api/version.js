export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v46-crm-legacy-total-adapter',
    builtAt: '2026-08-19T14:05:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Adapt mini app calculated totals to the legacy soft-windows CRM calculation fields used by the dashboard'
  });
}
