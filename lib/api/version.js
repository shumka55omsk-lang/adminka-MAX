export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v27-crm-leads-board',
    builtAt: '2026-06-28T06:40:00Z',
    miniappUrl: '/miniapp',
    consentMode: 'soft',
    ui: 'crm-leads-board'
  });
}
