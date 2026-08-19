export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v44-crm-calculated-request',
    builtAt: '2026-08-18T20:11:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Hide client preliminary price and send calculated CRM request with install/opening options'
  });
}
