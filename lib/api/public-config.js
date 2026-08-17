export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const metrikaCounterId = String(process.env.YANDEX_METRIKA_COUNTER_ID || '').trim();
  const privacyUrl = String(process.env.PRIVACY_POLICY_URL || '').trim();
  const consentText = String(process.env.MINIAPP_CONSENT_TEXT || '').trim();
  const miniappPublicUrl = String(process.env.MINIAPP_PUBLIC_URL || 'https://www.zamer55.ru/miniapp').trim();
  const miniappButtonType = String(process.env.MINIAPP_BUTTON_TYPE || 'short_link').trim().toLowerCase();
  const maxOpenAppWebApp = String(process.env.MAX_OPEN_APP_WEB_APP || 'id550507026940_bot').trim();

  return res.status(200).json({
    ok: true,
    yandexMetrikaCounterId: /^\d+$/.test(metrikaCounterId) ? metrikaCounterId : '',
    privacyUrl: /^https?:\/\//i.test(privacyUrl) ? privacyUrl : '',
    miniappPublicUrl: /^https?:\/\//i.test(miniappPublicUrl) ? miniappPublicUrl : 'https://www.zamer55.ru/miniapp',
    miniappButtonType: miniappButtonType === 'open_app' ? 'open_app' : 'short_link',
    maxOpenAppWebApp: /^[a-zA-Z0-9_]+_bot$/.test(maxOpenAppWebApp) ? maxOpenAppWebApp : 'id550507026940_bot',
    consentText: consentText || 'Нажимая кнопку, вы соглашаетесь с обработкой данных для связи по заявке.'
  });
}
