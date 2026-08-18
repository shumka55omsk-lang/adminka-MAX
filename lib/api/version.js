export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: 'v40-external-crm-sync',
    builtAt: '2026-08-18T08:55:00+06:00',
    miniappUrl: '/miniapp',
    apiMode: 'single-catch-all-function',
    reason: 'Estimate leads from MAX mini app sync to a dedicated soft-windows CRM Supabase when CRM_SUPABASE_URL is configured'
  });
}
