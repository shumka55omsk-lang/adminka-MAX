export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    version: 'v13-status-fixed',
    builtAt: '2026-06-27T13:45:00Z'
  });
}
