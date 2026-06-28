export default async function handler(req, res) {
  return res.status(200).json({ ok: true, version: 'v23-soft-consent', builtAt: '2026-06-28T04:55:00Z', miniappUrl: '/miniapp', consentMode: 'soft' });
}
