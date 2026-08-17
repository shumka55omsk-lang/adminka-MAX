export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v37-openapp-attribution',
    builtAt: '2026-08-17T19:12:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Open App attribution fix: campaigns and post IDs are preserved for MAX mini app buttons'
  });
}
