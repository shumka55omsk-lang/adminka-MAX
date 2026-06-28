export default async function handler(req, res) {
  return res.status(200).json({ ok: true, version: 'v26-hide-miniapp-prices', builtAt: '2026-06-28T06:10:00Z', miniappUrl: '/miniapp', consentMode: 'soft' });
}
