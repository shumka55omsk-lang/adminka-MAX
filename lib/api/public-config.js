export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const metrikaCounterId = String(process.env.YANDEX_METRIKA_COUNTER_ID || '').trim();
  const privacyUrl = String(process.env.PRIVACY_POLICY_URL || '').trim();
  const consentText = String(process.env.MINIAPP_CONSENT_TEXT || '').trim();

  return res.status(200).json({
    ok: true,
    yandexMetrikaCounterId: /^\d+$/.test(metrikaCounterId) ? metrikaCounterId : '',
    privacyUrl: /^https?:\/\//i.test(privacyUrl) ? privacyUrl : '',
    consentText: consentText || 'Нажимая кнопку, вы соглашаетесь с обработкой данных для связи по заявке.'
  });
}
