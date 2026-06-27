export default function handler(req, res) {
  res.status(200).json({ ok: true, version: 'v14-miniapp', builtAt: '2026-06-28T00:00:00Z', miniappUrl: '/miniapp' });
}
