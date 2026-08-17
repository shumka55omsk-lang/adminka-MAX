export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v33-two-client-flows',
    builtAt: '2026-08-17T13:18:00+06:00',
    miniappUrl: '/miniapp',
    consentMode: 'soft',
    ui: 'two-client-flows'
  });
}
