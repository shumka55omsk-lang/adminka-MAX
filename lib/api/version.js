export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v38-hide-client-attribution',
    builtAt: '2026-08-17T19:30:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Client-safe mini app: source/campaign/post tracking is saved internally but never shown to the customer'
  });
}
