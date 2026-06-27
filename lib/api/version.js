export default function handler(req, res) {
  res.status(200).json({ ok: true, version: 'v17-no-vercel-json', builtAt: '2026-06-28T01:35:00Z', miniappUrl: '/miniapp', apiMode: 'single-catch-all-function' });
}
