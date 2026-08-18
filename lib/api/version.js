export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v43-miniapp-flow-cleanup',
    builtAt: '2026-08-18T19:56:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Mini app flow cleanup: no photo steps/contact buttons, blind/opening type instead of zipper choice'
  });
}
