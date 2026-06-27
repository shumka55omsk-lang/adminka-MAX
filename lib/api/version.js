export default async function handler(req, res) {
  return res.status(200).json({ ok: true, version: 'v18-schema-fix', builtAt: '2026-06-27T19:25:00Z' });
}
