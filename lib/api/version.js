export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v39-estimate-to-soft-windows-crm',
    builtAt: '2026-08-18T08:35:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Estimate leads from MAX mini app are sent directly into the soft-windows CRM clients/calculations/client_history while measure-only leads stay in miniapp CRM'
  });
}
