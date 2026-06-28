export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v28-growth-suite',
    builtAt: '2026-06-28T14:25:00Z',
    miniappUrl: '/miniapp',
    consentMode: 'soft',
    ui: 'growth-suite'
  });
}
