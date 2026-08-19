export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v53-opening-coefficient-manufacturing-only',
    builtAt: '2026-08-19T17:45:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Apply openable-window coefficient only to manufacturing; installation is added without multiplier'
  });
}
