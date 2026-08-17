export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v36-short-miniapp-links',
    builtAt: '2026-08-17T18:27:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Short /z and /s mini app links for MAX/iPhone + optional open_app button mode'
  });
}
