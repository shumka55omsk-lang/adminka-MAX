import { supabaseFetch, hasSupabase, crmSupabaseFetch, hasCrmSupabase } from './_supabase.js';
import { maxFetch } from './_max.js';
import { sendToChats } from './_sendCore.js';
import { validateMaxWebAppData, isMaxAuthFresh } from './_maxWebApp.js';

function sanitizeText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9+]/g, '').slice(0, 32);
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function compactNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePhotoDataUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(text)) return '';
  const approxBytes = Math.round(text.length * 0.75);
  if (approxBytes > 2 * 1024 * 1024) {
    throw new Error('Фото слишком большое. Максимум для мини-приложения — около 2 МБ после сжатия.');
  }
  return text;
}

function normalizePhotoInfo(value) {
  const info = value && typeof value === 'object' ? value : {};
  return {
    originalName: sanitizeText(info.originalName, 180),
    originalSize: compactNumber(info.originalSize),
    sizeApprox: compactNumber(info.sizeApprox),
    width: compactNumber(info.width),
    height: compactNumber(info.height),
    type: sanitizeText(info.type, 80)
  };
}

function normalizeAttribution(value = {}) {
  const a = value && typeof value === 'object' ? value : {};
  return {
    source: sanitizeText(a.source || a.utm_source || 'max_miniapp', 160),
    utm_source: sanitizeText(a.utm_source || a.source || 'max_miniapp', 160),
    utm_medium: sanitizeText(a.utm_medium, 160),
    utm_campaign: sanitizeText(a.utm_campaign, 160),
    utm_content: sanitizeText(a.utm_content, 160),
    utm_term: sanitizeText(a.utm_term, 160),
    ref_chat_id: sanitizeText(a.ref_chat_id, 160),
    landing_url: sanitizeText(a.landing_url, 1000)
  };
}

function decodeBase64Url(value) {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function normalizeFlow(value) {
  const flow = String(value || '').trim().toLowerCase();
  return flow === 'estimate' || flow === 'measure' ? flow : '';
}

function parseLaunchPayload(rawPayload) {
  const payload = String(rawPayload || '').trim();
  if (!payload) return {};

  if (payload.startsWith('m_')) {
    try {
      const parsed = JSON.parse(decodeBase64Url(payload.slice(2)) || '{}');
      return {
        flow: normalizeFlow(parsed.f || parsed.flow || parsed.mode),
        campaign: sanitizeText(parsed.c || parsed.campaign, 160),
        content: sanitizeText(parsed.p || parsed.content, 160),
        medium: sanitizeText(parsed.m || parsed.medium, 160)
      };
    } catch {
      return {};
    }
  }

  if (payload.includes('=')) {
    try {
      const params = new URLSearchParams(payload.replace(/^#/, '').replace(/^\?/, ''));
      return {
        flow: normalizeFlow(params.get('f') || params.get('flow') || params.get('mode')),
        campaign: sanitizeText(params.get('c') || params.get('utm_campaign') || params.get('campaign'), 160),
        content: sanitizeText(params.get('p') || params.get('utm_content') || params.get('content'), 160),
        medium: sanitizeText(params.get('m') || params.get('utm_medium') || params.get('medium'), 160)
      };
    } catch {
      return {};
    }
  }

  if (payload.includes('__')) {
    const result = {};
    payload.split('__').forEach((part) => {
      const index = part.indexOf('-');
      if (index <= 0) return;
      const key = part.slice(0, index);
      const value = part.slice(index + 1);
      if (key === 'f') result.flow = normalizeFlow(value);
      if (key === 'c') result.campaign = sanitizeText(value, 160);
      if (key === 'p') result.content = sanitizeText(value, 160);
      if (key === 'm') result.medium = sanitizeText(value, 160);
    });
    if (result.flow || result.campaign || result.content || result.medium) return result;
  }

  const tokens = payload.split('_');
  const getAfter = (key) => {
    const index = tokens.indexOf(key);
    return index >= 0 ? sanitizeText(tokens[index + 1], 160) : '';
  };
  return {
    flow: normalizeFlow(getAfter('f')),
    campaign: getAfter('c'),
    content: getAfter('p'),
    medium: getAfter('m')
  };
}

function getParamFromText(text, key) {
  try {
    const value = String(text || '').replace(/^#/, '').replace(/^\?/, '');
    if (!value || !value.includes('=')) return '';
    return sanitizeText(new URLSearchParams(value).get(key), 500);
  } catch {
    return '';
  }
}

function getLaunchPayloadFromBody(body = {}) {
  const unsafe = body.initDataUnsafe || {};
  const candidates = [
    body.openAppPayload,
    body.attribution?.open_app_payload,
    unsafe.start_param,
    unsafe.startParam,
    unsafe.payload,
    unsafe.start_payload,
    getParamFromText(body.initData, 'start_param'),
    getParamFromText(body.initData, 'startParam'),
    getParamFromText(body.initData, 'payload'),
    getParamFromText(body.landingUrl || body.attribution?.landing_url, 'start_param'),
    getParamFromText(body.landingUrl || body.attribution?.landing_url, 'payload')
  ];
  for (const item of candidates) {
    const value = sanitizeText(item, 500);
    if (value) return value;
  }
  return '';
}

function normalizeAttributionWithLaunch(value = {}, body = {}) {
  const base = normalizeAttribution(value);
  const parsed = parseLaunchPayload(getLaunchPayloadFromBody(body));
  const flow = parsed.flow || normalizeFlow(body.form?.leadMode);
  const campaign = base.utm_campaign || parsed.campaign || getParamFromText(base.landing_url, 'c') || getParamFromText(base.landing_url, 'utm_campaign');
  const rawContent = base.utm_content || parsed.content || getParamFromText(base.landing_url, 'p') || getParamFromText(base.landing_url, 'utm_content');
  const content = rawContent && flow && !rawContent.endsWith(`_${flow}`) ? `${rawContent}_${flow}` : rawContent;
  const medium = base.utm_medium || parsed.medium || getParamFromText(base.landing_url, 'm') || getParamFromText(base.landing_url, 'utm_medium') || (campaign || content ? 'max_group' : '');
  const source = base.source && base.source !== 'max_miniapp'
    ? base.source
    : (campaign || content ? 'max_group' : (base.source || 'max_miniapp'));

  return {
    ...base,
    source,
    utm_source: base.utm_source && base.utm_source !== 'max_miniapp' ? base.utm_source : source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: content,
    utm_term: base.utm_term || (flow === 'estimate' ? 'known_sizes' : (flow === 'measure' ? 'free_measure' : 'open_app')),
    open_app_payload: sanitizeText(getLaunchPayloadFromBody(body), 500)
  };
}

function buildLeadText(lead, savedId = null) {
  const f = lead.form || {};
  const estimate = lead.estimate || {};
  const lines = [];
  lines.push('🪟 Новая заявка на замер из MAX');
  if (savedId) lines.push(`ID заявки: ${savedId}`);
  if (lead.duplicate) lines.push('⚠️ Возможный дубль: такой телефон/посетитель уже оставлял заявку недавно');
  lines.push(`Статус CRM: ${lead.duplicate ? 'duplicate' : 'new'}`);
  if (f.requestType) lines.push(`Сценарий: ${f.requestType}`);
  if (lead.attribution?.utm_campaign || lead.attribution?.utm_content) {
    lines.push(`Источник: ${lead.attribution.source || '—'} / ${lead.attribution.utm_campaign || 'без кампании'} / ${lead.attribution.utm_content || 'без поста'}`);
  }
  if (lead.visitorId) lines.push(`visitor_id: ${lead.visitorId}`);
  if (lead.consent?.adConsent) lines.push('Реклама/ретаргетинг: согласие получено');
  lines.push('');
  lines.push(`Имя: ${f.name || 'не указано'}`);
  lines.push(`Телефон: ${lead.phone || f.phone || 'не указан'}`);
  lines.push(`Адрес: ${f.address || 'не указан'}`);
  lines.push(`Тип объекта: ${f.objectType || 'не указан'}`);
  lines.push(`Замер: ${f.expectedDate || 'не указано'}`);
  lines.push(`Формат: ${f.mountingType || 'не указано'}`);
  if (f.openingType) lines.push(`Тип изделий: ${f.openingType}`);
  if (f.needZippers) lines.push('Молнии: нужны');
  if (estimate.areaM2) lines.push(`Площадь: ${estimate.areaM2} м²`);
  if (estimate.total) lines.push(`Предварительно: ${Number(estimate.total).toLocaleString('ru-RU')} ₽`);
  if (estimate.base || estimate.install || estimate.zippers) {
    lines.push(`Плёнка/окантовка: ${Number(estimate.base || 0).toLocaleString('ru-RU')} ₽`);
    if (estimate.install) lines.push(`Монтаж: ${Number(estimate.install).toLocaleString('ru-RU')} ₽`);
    if (estimate.zippers) lines.push(`Молнии: ${Number(estimate.zippers).toLocaleString('ru-RU')} ₽`);
  }
  if (Array.isArray(f.windows) && f.windows.length) {
    lines.push('');
    lines.push('Размеры:');
    f.windows.slice(0, 12).forEach((w, i) => {
      lines.push(`${i + 1}) ${w.widthCm || 0}×${w.heightCm || 0} см × ${w.count || 1} шт.`);
    });
  } else if (f.leadMode === 'measure') {
    lines.push('');
    lines.push('Размеры: клиент не знает размеры, нужен бесплатный замер.');
  }
  if (lead.photoDataUrl) {
    lines.push('');
    lines.push('Фото проёма прикреплено к сообщению и сохранено в Supabase.');
  }
  if (f.comment) {
    lines.push('');
    lines.push(`Комментарий: ${f.comment}`);
  }
  if (lead.maxUser?.id) {
    lines.push('');
    lines.push(`MAX user_id: ${lead.maxUser.id}`);
    if (lead.maxUser.username) lines.push(`MAX username: @${lead.maxUser.username}`);
  }
  return lines.join('\n').slice(0, 3600);
}

function buildAdminButtons(lead, savedId = null) {
  const f = lead.form || {};
  const phoneDigits = normalizePhoneDigits(lead.phone || f.phone);
  const buttons = [];
  if (phoneDigits) {
    buttons.push({ text: 'WhatsApp', url: `https://wa.me/7${phoneDigits}` });
    buttons.push({ text: 'Позвонить', url: `https://wa.me/7${phoneDigits}?text=${encodeURIComponent('Здравствуйте! Получили вашу заявку на мягкие окна. Уточним детали замера?')}` });
  }
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (baseUrl) buttons.push({ text: 'Открыть CRM', url: `${baseUrl}/?lead_id=${encodeURIComponent(savedId || '')}#crmLeadsBoard` });
  return buttons;
}

async function notifyAdmin(lead, savedId = null) {
  const notifyChatId = String(process.env.MAX_NOTIFY_CHAT_ID || '').trim();
  if (!notifyChatId) return { skipped: true, reason: 'MAX_NOTIFY_CHAT_ID not set' };

  const text = buildLeadText(lead, savedId);
  if (lead.photoDataUrl) {
    return sendToChats({
      chatIds: [Number(notifyChatId)],
      text,
      buttons: buildAdminButtons(lead, savedId),
      imageDataUrl: lead.photoDataUrl,
      delayBetweenMs: 0
    });
  }

  return sendToChats({
    chatIds: [Number(notifyChatId)],
    text,
    buttons: buildAdminButtons(lead, savedId),
    imageDataUrl: null,
    delayBetweenMs: 0
  });
}

function isMissingColumnError(error) {
  const message = String(error?.message || error || '');
  return message.includes('PGRST204') || message.includes('Could not find') || message.includes('schema cache');
}

function getMissingColumnName(error) {
  const message = String(error?.message || error || '');
  const patterns = [
    /Could not find the ['\"]([^'\"]+)['\"] column/i,
    /column ['\"]([^'\"]+)['\"]/i,
    /schema cache.*?['\"]([^'\"]+)['\"]/i
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

async function insertLegacyRowAdaptive(table, row, { requiredKeys = [] } = {}) {
  const body = { ...(row || {}) };
  const removed = [];
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const data = await legacyFetch(table, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(body)
      });
      return { ok: true, data, removed_columns: removed, inserted_columns: Object.keys(body) };
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      const missing = getMissingColumnName(error);
      if (!missing || requiredKeys.includes(missing) || !(missing in body)) throw error;
      removed.push(missing);
      delete body[missing];
    }
  }
  throw new Error(`Не удалось вставить строку ${table}: слишком много несовместимых колонок`);
}

function isMissingTableError(error) {
  const message = String(error?.message || error || '');
  return message.includes('PGRST205') || message.includes('Could not find the table') || message.includes('relation') || message.includes('does not exist');
}

function crmIntegrationEnabled() {
  return String(process.env.CRM_INTEGRATION_ENABLED || 'false').toLowerCase() === 'true';
}

function legacyCrmDirectEnabled() {
  return String(process.env.CRM_LEGACY_DIRECT_ENABLED || 'true').toLowerCase() !== 'false';
}
function dedicatedCrmRequired() {
  return String(process.env.CRM_REQUIRE_DEDICATED_SUPABASE || 'true').toLowerCase() !== 'false';
}

function legacyCrmTargetInfo() {
  if (hasCrmSupabase()) {
    return {
      mode: 'dedicated_crm_supabase',
      env: 'CRM_SUPABASE_URL',
      configured: true
    };
  }
  return {
    mode: 'main_supabase_fallback',
    env: 'SUPABASE_URL',
    configured: hasSupabase(),
    warning: 'Используется база админки MAX. Для отдельной CRM мягких окон добавьте CRM_SUPABASE_URL и CRM_SUPABASE_SERVICE_ROLE_KEY.'
  };
}

async function legacyFetch(path, options = {}) {
  if (hasCrmSupabase()) return crmSupabaseFetch(path, options);
  return supabaseFetch(path, options);
}


function normalizeOpeningType(value) {
  const raw = sanitizeText(value, 120) || 'Глухие';
  const low = raw.toLowerCase();
  if (low.includes('откры')) return 'Открывающиеся';
  if (low.includes('глух')) return 'Глухие';
  return raw;
}

function isOpeningProduct(value) {
  return normalizeOpeningType(value).toLowerCase().includes('откры');
}

function isInstallSelected(form = {}, estimate = {}) {
  if (typeof form.needInstall === 'boolean') return form.needInstall;
  if (typeof estimate.needInstall === 'boolean') return estimate.needInstall;
  const mounting = String(form.mountingType || '').toLowerCase();
  if (mounting.includes('только') || mounting.includes('без монтаж') || mounting.includes('без монтажа')) return false;
  return true;
}

function calculateServerEstimate(form = {}, rawEstimate = {}) {
  const windows = Array.isArray(form.windows) ? form.windows : [];
  const area = windows.reduce((sum, w) => {
    const width = compactNumber(w.widthCm ?? w.width_cm ?? w.width);
    const height = compactNumber(w.heightCm ?? w.height_cm ?? w.height ?? w.height1);
    const count = Math.max(1, compactNumber(w.count ?? w.qty ?? w.quantity, 1));
    return sum + (width / 100) * (height / 100) * count;
  }, 0);
  const openingsCount = windows.reduce((sum, w) => sum + Math.max(1, compactNumber(w.count ?? w.qty ?? w.quantity, 1)), 0);
  const pricePerM2 = compactNumber(rawEstimate.pricePerM2, 1800) || 1800;
  const installPerM2 = compactNumber(rawEstimate.installPerM2, 700) || 700;
  const zipperPerOpening = compactNumber(rawEstimate.zipperPerOpening, 700) || 700;
  const objectFactor = compactNumber(rawEstimate.objectFactor, 1) || 1;
  const minOrder = compactNumber(rawEstimate.minOrder, 5000) || 5000;
  const needInstall = isInstallSelected(form, rawEstimate);
  const needZippers = Boolean(form.needZippers);
  const base = area * pricePerM2 * objectFactor;
  const install = needInstall ? area * installPerM2 : 0;
  const zippers = needZippers ? openingsCount * zipperPerOpening : 0;
  const subtotal = base + install + zippers;
  const total = area > 0 ? Math.max(minOrder, Math.round(subtotal)) : 0;
  return {
    areaM2: Number(area.toFixed(2)),
    openingsCount,
    base: Math.round(base),
    install: Math.round(install),
    zippers: Math.round(zippers),
    total,
    pricePerM2,
    installPerM2,
    zipperPerOpening,
    objectFactor,
    minOrder,
    needInstall,
    needZippers,
    mountingType: form.mountingType || (needInstall ? 'С монтажом' : 'Только изготовление'),
    openingType: normalizeOpeningType(form.openingType)
  };
}

function normalizeLegacyWindow(w, index = 0, lead = {}) {
  const f = lead.form || {};
  const openingType = normalizeOpeningType(f.openingType);
  const openingProduct = isOpeningProduct(openingType);
  const fixedProduct = !openingProduct;
  const width = compactNumber(w?.widthCm ?? w?.width_cm ?? w?.width ?? w?.w_cm);
  const height = compactNumber(w?.heightCm ?? w?.height_cm ?? w?.height ?? w?.h_cm ?? w?.height1 ?? w?.height1Cm);
  const count = Math.max(1, compactNumber(w?.count ?? w?.qty ?? w?.quantity, 1));
  const areaOne = Number(((width / 100) * (height / 100)).toFixed(3));
  const area = Number((areaOne * count).toFixed(3));
  const estimate = lead.estimate || {};
  const pricePerM2 = compactNumber(estimate.pricePerM2, 1800);
  const objectFactor = compactNumber(estimate.objectFactor, 1);
  const itemMaterialTotal = Math.round(area * pricePerM2 * objectFactor);
  const itemInstallTotal = isInstallSelected(f, estimate) ? Math.round(area * compactNumber(estimate.installPerM2, 0)) : 0;
  const itemTotal = itemMaterialTotal + itemInstallTotal;
  const title = `Окно ${index + 1}`;
  const sizeText = `${width}×${height} см`;

  // ВАЖНО: старая CRM мягких окон в разных версиях читала размеры из разных ключей.
  // Поэтому передаём один и тот же размер в старых и новых именах полей.
  // Основные числовые поля width/height/height1/height2 оставлены в САНТИМЕТРАХ,
  // как в ручном калькуляторе CRM.
  return {
    id: index + 1,
    n: index + 1,
    no: index + 1,
    index,
    title,
    name: title,
    label: `${title}: ${sizeText}${count > 1 ? ` × ${count} шт.` : ''}`,

    // Основной формат старой CRM: ширина + две высоты трапеции/прямоугольника.
    width,
    height,
    height1: height,
    height2: height,
    w: width,
    h: height,
    h1: height,
    h2: height,

    // Явные сантиметры.
    width_cm: width,
    height_cm: height,
    height1_cm: height,
    height2_cm: height,
    widthCm: width,
    heightCm: height,
    height1Cm: height,
    height2Cm: height,

    // Явные метры — только для тех экранов CRM, которые считают площадь из метров.
    width_m: Number((width / 100).toFixed(3)),
    height_m: Number((height / 100).toFixed(3)),
    height1_m: Number((height / 100).toFixed(3)),
    height2_m: Number((height / 100).toFixed(3)),

    count,
    qty: count,
    quantity: count,
    amount: count,
    area_m2: area,
    areaM2: area,
    area_one_m2: areaOne,
    areaOneM2: areaOne,

    // Суммы на уровне позиции: некоторые версии дашборда суммируют именно items[].total.
    material_total: itemMaterialTotal,
    product_total: itemMaterialTotal,
    base_total: itemMaterialTotal,
    install_total: itemInstallTotal,
    installation_total: itemInstallTotal,
    total: itemTotal,
    sum: itemTotal,
    price: itemTotal,
    amount_total: itemTotal,
    total_price: itemTotal,
    totalClient: itemTotal,
    clientTotal: itemTotal,
    client_total: itemTotal,

    dimensions: `${sizeText}${count > 1 ? ` × ${count} шт.` : ''}`,
    size_text: `${sizeText}${count > 1 ? ` × ${count} шт.` : ''}`,
    sizes_text: `${sizeText}${count > 1 ? ` × ${count} шт.` : ''}`,

    shape: 'rectangle',
    form: 'rect',
    type: 'window',
    item_type: 'soft_window',
    product_type: 'soft_window',
    opening_type: openingType,
    openingType,
    product_variant: openingType,
    variant: openingType,
    mounting_type: f.mountingType || null,
    need_install: isInstallSelected(f, lead.estimate || {}),

    // Тип изделия для старой CRM: глухие/открывающиеся влияют на фурнитуру и раскрой.
    isDeaf: fixedProduct,
    isFixed: fixedProduct,
    deaf: fixedProduct,
    fixed: fixedProduct,
    глухое: fixedProduct,
    isOpening: openingProduct,
    isOpenable: openingProduct,
    openable: openingProduct,
    opening: openingProduct,
    canOpen: openingProduct,
    hardware_type: openingProduct ? 'oval_42x22_sides_bottom_top_10mm' : 'round_10mm_perimeter',
    grommet_type: openingProduct ? 'oval_42x22_and_round_top' : 'round_10mm',
    grommet_mode: openingProduct ? 'openable' : 'fixed',

    // Безопасные дефолты, чтобы CRM не воспринимала заявку как пустую/трапецию с нулевой стороной.
    zipper: false,
    zipperCount: 0,
    zippers: 0,
    source: 'max_miniapp'
  };
}

function buildLegacyItems(lead) {
  const f = lead.form || {};
  return (Array.isArray(f.windows) ? f.windows : [])
    .map((w, index) => normalizeLegacyWindow(w, index, lead))
    .filter((w) => w.width_cm > 0 && w.height_cm > 0);
}

function buildWindowSizesText(lead) {
  const items = buildLegacyItems(lead);
  if (!items.length) return '';
  return items.map((w, index) => {
    const qty = w.count > 1 ? ` × ${w.count} шт.` : '';
    return `Окно ${index + 1}: ${w.width_cm}×${w.height_cm} см${qty} — ${w.area_m2} м²`;
  }).join('\n');
}

function buildLegacyPrices(lead) {
  const estimate = lead.estimate || {};
  const f = lead.form || {};
  const total = Math.round(compactNumber(estimate.total));
  const base = Math.round(compactNumber(estimate.base));
  const install = Math.round(compactNumber(estimate.install));
  const areaM2 = compactNumber(estimate.areaM2);
  return {
    price_per_m2: compactNumber(estimate.pricePerM2),
    pricePerM2: compactNumber(estimate.pricePerM2),
    pvc_price_per_m2: compactNumber(estimate.pricePerM2),
    manufacture_price_per_m2: compactNumber(estimate.pricePerM2),
    install_per_m2: compactNumber(estimate.installPerM2),
    installPerM2: compactNumber(estimate.installPerM2),
    zipper_per_opening: compactNumber(estimate.zipperPerOpening),
    zipperPerOpening: compactNumber(estimate.zipperPerOpening),
    object_factor: compactNumber(estimate.objectFactor, 1),
    objectFactor: compactNumber(estimate.objectFactor, 1),
    min_order: compactNumber(estimate.minOrder),
    minOrder: compactNumber(estimate.minOrder),

    // Старый дашборд CRM раньше читал итог из prices, а не из totals.
    base,
    material_total: base,
    product_total: base,
    products_total: base,
    install,
    install_total: install,
    installation_total: install,
    area_m2: areaM2,
    areaM2,
    total,
    sum: total,
    total_sum: total,
    total_price: total,
    totalPrice: total,
    estimated_total: total,
    calculated_total: total,
    amount: total,
    price: total,
    final_price: total,
    totalClient: total,
    clientTotal: total,
    client_total: total,
    totalAmount: total,
    finalTotal: total,
    grandTotal: total,
    total_for_client: total,
    totalForClient: total,
    payable_total: total,
    payableTotal: total,
    mounting_type: f.mountingType || null,
    need_install: isInstallSelected(f, estimate),
    opening_type: normalizeOpeningType(f.openingType),
    currency: 'RUB'
  };
}

function buildLegacyTotals(lead, savedLeadId) {
  const estimate = lead.estimate || {};
  const f = lead.form || {};
  const items = buildLegacyItems(lead);
  const sizesText = buildWindowSizesText(lead);
  const areaM2 = compactNumber(estimate.areaM2 || items.reduce((sum, item) => sum + item.area_m2, 0));
  const total = Math.round(compactNumber(estimate.total));
  const windowsCount = items.reduce((sum, item) => sum + item.count, 0);
  return {
    area_m2: areaM2,
    areaM2,
    total_area_m2: areaM2,
    area: areaM2,
    openings_count: compactNumber(estimate.openingsCount || windowsCount),
    windows_count: windowsCount,
    count: windowsCount,
    base: Math.round(compactNumber(estimate.base)),
    material_total: Math.round(compactNumber(estimate.base)),
    install: Math.round(compactNumber(estimate.install)),
    install_total: Math.round(compactNumber(estimate.install)),
    zippers: Math.round(compactNumber(estimate.zippers)),
    zipper_total: Math.round(compactNumber(estimate.zippers)),
    total,
    sum: total,
    total_sum: total,
    totalPrice: total,
    grand_total: total,
    estimated_total: total,
    calculated_total: total,
    amount: total,
    price: total,
    final_price: total,
    total_cost: total,

    // Алиасы из старой CRM/калькулятора. Дашборд старой CRM мог читать не total,
    // а clientTotal/totalClient/totalAmount внутри JSON расчёта.
    totalAmount: total,
    totalClient: total,
    clientTotal: total,
    client_total: total,
    finalTotal: total,
    final_total: total,
    grandTotal: total,
    grand_total: total,
    total_for_client: total,
    totalForClient: total,
    sale_total: total,
    saleTotal: total,
    sale_price: total,
    order_amount: total,
    orderAmount: total,
    deal_amount: total,
    dealAmount: total,
    payable_total: total,
    payableTotal: total,

    production_total: Math.round(compactNumber(estimate.base)),
    totalProduction: Math.round(compactNumber(estimate.base)),
    product_total: Math.round(compactNumber(estimate.base)),
    productTotal: Math.round(compactNumber(estimate.base)),
    installation_total: Math.round(compactNumber(estimate.install)),
    installTotal: Math.round(compactNumber(estimate.install)),
    montage_total: Math.round(compactNumber(estimate.install)),
    mounting_total: Math.round(compactNumber(estimate.install)),
    need_install: isInstallSelected(f, estimate),
    mounting_type: f.mountingType || null,
    install_included: isInstallSelected(f, estimate),
    lead_mode: f.leadMode || 'estimate',
    request_type: f.requestType || 'Знаю размеры — хочу узнать стоимость',
    opening_type: normalizeOpeningType(f.openingType),
    product_variant: normalizeOpeningType(f.openingType),
    is_opening: isOpeningProduct(f.openingType),
    is_fixed: !isOpeningProduct(f.openingType),
    source: lead.attribution?.source || lead.source || 'max_miniapp',
    utm_campaign: lead.attribution?.utm_campaign || null,
    utm_content: lead.attribution?.utm_content || null,
    miniapp_lead_id: savedLeadId || null,
    sizes_text: sizesText,
    windows: items,
    rows: items,
    items
  };
}

function buildLegacyMaterials(lead) {
  const f = lead.form || {};
  return {
    mounting_type: f.mountingType || null,
    opening_type: normalizeOpeningType(f.openingType),
    product_variant: normalizeOpeningType(f.openingType),
    is_opening: isOpeningProduct(f.openingType),
    is_fixed: !isOpeningProduct(f.openingType),
    need_zippers: Boolean(f.needZippers),
    need_install: isInstallSelected(f, lead.estimate || {}),
    install_included: isInstallSelected(f, lead.estimate || {}),
    expected_date: f.expectedDate || null,
    object_type: f.objectType || null,
    sizes_text: buildWindowSizesText(lead),
    source: 'max_miniapp'
  };
}

async function findOrCreateLegacyClient(lead) {
  const f = lead.form || {};
  const phone = lead.phone || f.phone || null;
  const clientRow = {
    name: f.name || null,
    phone,
    address: f.address || null
  };

  if (phone) {
    try {
      const rows = await legacyFetch(`clients?select=id,name,phone,address&phone=eq.${encodeURIComponent(phone)}&limit=1`, { method: 'GET' });
      if (Array.isArray(rows) && rows[0]?.id) {
        const patch = {};
        if (f.name) patch.name = f.name;
        if (f.address) patch.address = f.address;
        if (Object.keys(patch).length) {
          try {
            await legacyFetch(`clients?id=eq.${encodeURIComponent(rows[0].id)}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
              },
              body: JSON.stringify(patch)
            });
          } catch (error) {
            if (!isMissingColumnError(error)) throw error;
          }
        }
        return { id: rows[0].id, existed: true };
      }
    } catch (error) {
      if (isMissingColumnError(error)) {
        const rows = await legacyFetch(`clients?select=id&phone=eq.${encodeURIComponent(phone)}&limit=1`, { method: 'GET' });
        if (Array.isArray(rows) && rows[0]?.id) return { id: rows[0].id, existed: true };
      } else {
        throw error;
      }
    }
  }

  try {
    const created = await legacyFetch('clients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(clientRow)
    });
    return { id: Array.isArray(created) && created[0] ? created[0].id : null, existed: false, data: created };
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const fallback = await legacyFetch('clients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ name: f.name || null, phone })
    });
    return { id: Array.isArray(fallback) && fallback[0] ? fallback[0].id : null, existed: false, data: fallback };
  }
}

async function patchLegacyTableOptional(table, id, patch) {
  if (!table || !id || !patch || !Object.keys(patch).length) return { skipped: true };
  try {
    await legacyFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(patch)
    });
    return { ok: true, table, columns: Object.keys(patch) };
  } catch (error) {
    if (isMissingColumnError(error)) return { skipped: true, table, reason: error.message, columns: Object.keys(patch) };
    return { ok: false, table, error: error.message, columns: Object.keys(patch) };
  }
}

async function patchLegacyCalculationOptional(calculationId, patch) {
  return patchLegacyTableOptional('calculations', calculationId, patch);
}

async function patchLegacyClientOptional(clientId, patch) {
  return patchLegacyTableOptional('clients', clientId, patch);
}

function buildLegacyClientDashboardPatch(lead, savedLeadId, calculationId) {
  const f = lead.form || {};
  const estimate = lead.estimate || {};
  const totals = buildLegacyTotals(lead, savedLeadId);
  const items = buildLegacyItems(lead);
  const sizesText = buildWindowSizesText(lead);
  const total = totals.total;
  const now = new Date().toISOString();
  return {
    // Самые вероятные поля, которые читает дашборд старой CRM.
    amount: total,
    total: total,
    sum: total,
    total_sum: total,
    total_price: total,
    price: total,
    final_price: total,
    calculated_total: total,
    estimated_total: total,
    order_total: total,
    order_sum: total,
    deal_total: total,
    deal_sum: total,
    request_total: total,
    last_total: total,
    last_amount: total,
    last_sum: total,
    crm_total: total,
    products_total: total,
    totalAmount: total,
    totalClient: total,
    clientTotal: total,
    client_total: total,
    finalTotal: total,
    final_total: total,
    grandTotal: total,
    grand_total: total,
    total_for_client: total,
    totalForClient: total,
    sale_total: total,
    saleTotal: total,
    sale_price: total,
    order_amount: total,
    orderAmount: total,
    deal_amount: total,
    dealAmount: total,
    last_order_total: total,
    last_calculation_total: total,
    latest_total: total,
    dashboard_total: total,
    kanban_total: total,
    material_total: totals.material_total,
    install_total: totals.install_total,

    // Площадь и состав заявки — для карточки клиента/дашборда.
    area_m2: totals.area_m2,
    area: totals.area_m2,
    total_area_m2: totals.area_m2,
    windows_count: totals.windows_count,
    openings_count: totals.openings_count,
    count: totals.count,
    windows: items,
    items,
    sizes: items,
    sizes_text: sizesText,

    // Связь с расчётом и происхождение.
    calculation_id: calculationId || null,
    last_calculation_id: calculationId || null,
    current_calculation_id: calculationId || null,
    miniapp_lead_id: savedLeadId || null,
    source: 'max_miniapp',
    lead_source: 'MAX mini app',
    request_type: f.requestType || 'Знаю размеры — хочу узнать стоимость',
    lead_mode: f.leadMode || 'estimate',
    object_type: f.objectType || null,
    mounting_type: f.mountingType || null,
    need_install: isInstallSelected(f, estimate),
    opening_type: normalizeOpeningType(f.openingType),
    product_variant: normalizeOpeningType(f.openingType),

    // Статусы и дата обновления, если такие колонки есть.
    status: 'new',
    crm_status: 'new',
    order_status: 'new',
    dashboard_status: 'new',
    title: `MAX mini app — ${total.toLocaleString('ru-RU')} ₽`,
    last_calculation_title: `MAX mini app — ${total.toLocaleString('ru-RU')} ₽`,
    updated_at: now,
    last_activity_at: now,
    last_order_at: now,
    comment: `Заявка из MAX mini app. Расчёт: ${total.toLocaleString('ru-RU')} ₽${sizesText ? `\n${sizesText}` : ''}`,
    note: `Заявка из MAX mini app. Расчёт: ${total.toLocaleString('ru-RU')} ₽${sizesText ? `\n${sizesText}` : ''}`,
    data: {
      source: 'max_miniapp',
      miniapp_lead_id: savedLeadId || null,
      calculation_id: calculationId || null,
      totals,
      windows: items,
      sizes_text: sizesText,
      estimate,
      form: f
    }
  };
}

async function patchLegacyClientDashboardOptional({ lead, savedLeadId, clientId, calculationId }) {
  if (!clientId) return { skipped: true, reason: 'no client id' };
  const patch = buildLegacyClientDashboardPatch(lead, savedLeadId, calculationId);
  const results = [];

  // Сначала одним большим PATCH: если в CRM все или почти все колонки есть — это быстрее.
  // Если schema cache вернёт ошибку по одной отсутствующей колонке, ниже заполним поля по одному.
  const bulk = await patchLegacyClientOptional(clientId, patch);
  results.push({ mode: 'bulk', ...bulk });
  if (bulk.ok) return { ok: true, mode: 'bulk', results };

  for (const [key, value] of Object.entries(patch)) {
    const one = await patchLegacyClientOptional(clientId, { [key]: value });
    results.push({ mode: 'single', ...one });
  }

  const okColumns = results.filter((r) => r.ok).flatMap((r) => r.columns || []);
  return { ok: okColumns.length > 0, mode: 'single_columns', ok_columns: okColumns, results };
}

async function insertLegacyCalculation({ lead, savedLeadId, clientId }) {
  const items = buildLegacyItems(lead);
  const sizesText = buildWindowSizesText(lead);
  const totals = buildLegacyTotals(lead, savedLeadId);
  const prices = buildLegacyPrices(lead);
  const materials = buildLegacyMaterials(lead);
  const crmState = {
    source: 'max_miniapp',
    miniapp_lead_id: savedLeadId || null,
    client_id: clientId,

    // ВАЖНО для старой CRM: в рабочей логике сайта итог был доступен
    // на верхнем уровне сохранённого расчёта. Дублируем сумму не только в totals.
    total: totals.total,
    sum: totals.total,
    total_sum: totals.total,
    total_price: totals.total,
    totalPrice: totals.total,
    estimated_total: totals.total,
    calculated_total: totals.total,
    amount: totals.total,
    price: totals.total,
    final_price: totals.total,
    totalClient: totals.total,
    clientTotal: totals.total,
    client_total: totals.total,
    totalAmount: totals.total,
    finalTotal: totals.total,
    grandTotal: totals.total,
    total_for_client: totals.total,
    totalForClient: totals.total,
    area_m2: totals.area_m2,
    areaM2: totals.area_m2,
    lead_mode: lead.form?.leadMode || 'estimate',
    object_type: lead.form?.objectType || null,
    address: lead.form?.address || null,
    windows: items,
    rows: items,
    sizes: items,
    items,
    sizes_text: sizesText,
    prices,
    totals,
    materials,
    raw_lead: lead
  };
  const row = {
    client_id: clientId,
    prices,
    // В старой CRM экран расчёта читает именно items. Поэтому здесь не краткий текст,
    // а полный массив окон с width/height1/height2 в сантиметрах.
    items,
    totals,
    materials: { ...materials, ...prices, ...totals },
    // если в таблице есть колонка summary — ниже она заполнится PATCH-ем;
    // здесь не кладём её в первичный INSERT, чтобы не сломать схему.
  };

  const data = await legacyFetch('calculations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });
  const id = Array.isArray(data) && data[0] ? data[0].id : null;

  // Совместимость со старой CRM: разные версии интерфейса могли читать размеры
  // из разных колонок. Основная запись выше сохраняет JSON в items/totals/materials,
  // а эти PATCH-и заполняют дополнительные колонки только если они есть в CRM.
  const optionalPatches = [];
  optionalPatches.push(await patchLegacyCalculationOptional(id, { windows: items }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { rows: items }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { sizes: items }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { sizes_text: sizesText }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { comment: `Заявка из MAX mini app\n${sizesText}`.trim() }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { note: `Заявка из MAX mini app\n${sizesText}`.trim() }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { description: sizesText }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { data: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { state: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { calc_state: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { form_data: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { calculation_data: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { raw_payload: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { summary: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { result: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { calculation: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { calc: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { snapshot: crmState }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { report: crmState }));

  // Дашборды разных версий CRM читают сумму из разных верхнеуровневых колонок.
  // Заполняем их только если такие колонки есть, чтобы заявка сразу была видна как рассчитанная.
  optionalPatches.push(await patchLegacyCalculationOptional(id, { area_m2: totals.area_m2 }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { total: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { sum: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { total_sum: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { total_price: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { totalPrice: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { grand_total: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { estimated_total: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { calculated_total: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { amount: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { totalClient: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { clientTotal: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { client_total: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { totalAmount: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { finalTotal: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { grandTotal: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { total_for_client: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { totalForClient: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { payable_total: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { payableTotal: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { price: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { final_price: totals.total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { material_total: totals.material_total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { install_total: totals.install_total }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { mounting_type: totals.mounting_type }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { opening_type: totals.opening_type }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { product_variant: totals.product_variant }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { source: 'max_miniapp' }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { status: 'new' }));
  optionalPatches.push(await patchLegacyCalculationOptional(id, { title: `MAX mini app — ${totals.total.toLocaleString('ru-RU')} ₽` }));

  return { id, data, sizes_text: sizesText, items_count: items.length, total: totals.total, optional_patches: optionalPatches };
}

async function insertLegacyHistory({ lead, savedLeadId, clientId, calculationId }) {
  const f = lead.form || {};
  const estimate = lead.estimate || {};
  const amount = Math.round(Number(estimate.total || 0));
  const windowsCount = Array.isArray(f.windows) ? f.windows.reduce((sum, w) => sum + Math.max(1, compactNumber(w.count, 1)), 0) : 0;
  const sizesText = buildWindowSizesText(lead);
  const text = [
    'Заявка из MAX mini app: клиент знает размеры.',
    f.objectType ? `Объект: ${f.objectType}` : '',
    f.openingType ? `Тип изделий: ${normalizeOpeningType(f.openingType)}` : '',
    f.mountingType ? `Формат: ${f.mountingType}` : '',
    f.address ? `Адрес: ${f.address}` : '',
    windowsCount ? `Проёмов/изделий: ${windowsCount}` : '',
    sizesText ? `Размеры:\n${sizesText}` : '',
    estimate.areaM2 ? `Площадь: ${estimate.areaM2} м²` : '',
    amount ? `Расчёт по заявке: ${amount.toLocaleString('ru-RU')} ₽` : ''
  ].filter(Boolean).join('\n');

  try {
    const data = await legacyFetch('client_history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        client_id: clientId,
        type: 'calculation',
        text,
        amount,
        extra: {
          miniapp_lead_id: savedLeadId || null,
          calculation_id: calculationId || null,
          attribution: lead.attribution || {},
          windows: f.windows || [],
          opening_type: f.openingType || null,
          sizes_text: sizesText,
          estimate: lead.estimate || {},
          lead_mode: f.leadMode || 'estimate'
        }
      })
    });
    return { ok: true, id: Array.isArray(data) && data[0] ? data[0].id : null, data };
  } catch (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return { skipped: true, reason: error.message };
    }
    throw error;
  }
}

async function insertCrmQueue(lead, savedLeadId) {
  const f = lead.form || {};
  const estimate = lead.estimate || {};
  const data = await supabaseFetch('max_crm_leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      miniapp_lead_id: savedLeadId,
      name: f.name || null,
      phone: lead.phone || f.phone || null,
      address: f.address || null,
      object_type: f.objectType || null,
      status: 'new',
      estimated_total: Math.round(Number(estimate.total || 0)),
      area_m2: Number(estimate.areaM2 || 0),
      payload: lead
    })
  });
  return { ok: true, table: 'max_crm_leads', data };
}

async function tryCrmIntegration(lead, savedLeadId) {
  if (!crmIntegrationEnabled() || !hasSupabase()) return { skipped: true, reason: 'CRM_INTEGRATION_ENABLED is not true' };

  const f = lead.form || {};
  if (f.leadMode !== 'estimate') {
    return { skipped: true, reason: 'Only “Знаю размеры” leads are sent to soft-windows CRM', leadMode: f.leadMode || 'measure' };
  }

  const result = {
    ok: true,
    mode: 'estimate_only',
    queue: null,
    legacyCrm: { skipped: true }
  };

  try {
    result.queue = await insertCrmQueue(lead, savedLeadId);
  } catch (error) {
    result.queue = { ok: false, error: error.message };
    result.ok = false;
  }

  if (!legacyCrmDirectEnabled()) {
    result.legacyCrm = { skipped: true, reason: 'CRM_LEGACY_DIRECT_ENABLED=false' };
    return result;
  }

  result.legacyCrm = {
    skipped: false,
    target: legacyCrmTargetInfo()
  };

  if (!hasCrmSupabase() && dedicatedCrmRequired()) {
    result.legacyCrm = {
      ok: false,
      target: legacyCrmTargetInfo(),
      error: 'Не задана отдельная база CRM мягких окон. Добавьте в Vercel CRM_SUPABASE_URL и CRM_SUPABASE_SERVICE_ROLE_KEY из проекта CRM мягких окон. Текущая база админки MAX не содержит таблицы clients/calculations.'
    };
    result.ok = false;
    return result;
  }

  try {
    const client = await findOrCreateLegacyClient(lead);
    if (!client?.id) throw new Error('Не удалось получить id клиента в таблице clients');
    const calculation = await insertLegacyCalculation({ lead, savedLeadId, clientId: client.id });
    const history = await insertLegacyHistory({ lead, savedLeadId, clientId: client.id, calculationId: calculation.id });
    result.legacyCrm = {
      ok: true,
      target: legacyCrmTargetInfo(),
      tables: ['clients', 'calculations', 'client_history'],
      client_id: client.id,
      client_existed: Boolean(client.existed),
      calculation_id: calculation.id,
      calculation,
      history
    };
  } catch (error) {
    result.legacyCrm = { ok: false, target: legacyCrmTargetInfo(), error: error.message };
    result.ok = false;
  }

  return result;
}



async function findRecentDuplicate({ phone, visitorId }) {
  if (!hasSupabase()) return null;
  const digits = normalizePhoneDigits(phone);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    if (digits) {
      const rows = await supabaseFetch(`max_miniapp_leads?select=id,phone,created_at,crm_status&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=80`, { method: 'GET' });
      const found = (Array.isArray(rows) ? rows : []).find((row) => normalizePhoneDigits(row.phone) === digits);
      if (found) return { type: 'phone', lead: found };
    }
    if (visitorId) {
      const rows = await supabaseFetch(`max_miniapp_leads?select=id,visitor_id,created_at,crm_status&visitor_id=eq.${encodeURIComponent(visitorId)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1`, { method: 'GET' });
      if (Array.isArray(rows) && rows[0]) return { type: 'visitor', lead: rows[0] };
    }
  } catch (error) {
    console.warn('Duplicate check warning', error.message);
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const antiSpam = body.antiSpam && typeof body.antiSpam === 'object' ? body.antiSpam : {};
    if (sanitizeText(antiSpam.website || antiSpam.companySite || '', 300)) {
      return res.status(200).json({ ok: true, saved: false, spam: true, message: 'Заявка принята' });
    }
    const initData = sanitizeText(body.initData, 10000);
    const validation = validateMaxWebAppData(initData, process.env.MAX_BOT_TOKEN);
    const allowUnverified = String(process.env.MINIAPP_ALLOW_UNVERIFIED || 'true').toLowerCase() === 'true';
    const requireFresh = String(process.env.MINIAPP_REQUIRE_FRESH_AUTH || 'false').toLowerCase() === 'true';

    if (!validation.ok && !allowUnverified) {
      return res.status(401).json({ ok: false, error: 'Данные MAX mini app не прошли проверку', validation: { ok: false, reason: validation.reason } });
    }
    if (validation.ok && requireFresh && !isMaxAuthFresh(validation.authDate, Number(process.env.MINIAPP_AUTH_MAX_AGE_SECONDS || 3600))) {
      return res.status(401).json({ ok: false, error: 'Сессия мини-приложения устарела', validation: { ok: true, fresh: false } });
    }

    const form = body.form || {};
    const estimate = body.estimate || {};
    const contact = body.contact || null;
    const maxUnsafe = body.initDataUnsafe || {};
    const photoDataUrl = normalizePhotoDataUrl(body.photoDataUrl);
    const photoInfo = normalizePhotoInfo(body.photoInfo);
    const attribution = normalizeAttributionWithLaunch(body.attribution || { source: body.source }, body);
    const visitorId = sanitizeText(body.visitorId, 120);
    const visitId = sanitizeText(body.visitId, 160);
    const consent = body.consent && typeof body.consent === 'object' ? {
      privacyConsent: Boolean(body.consent.privacyConsent),
      adConsent: Boolean(body.consent.adConsent),
      consentText: sanitizeText(body.consent.consentText, 600),
      consentAt: sanitizeText(body.consent.consentAt, 80)
    } : { privacyConsent: false, adConsent: false, consentText: '', consentAt: '' };

    const name = sanitizeText(form.name || maxUnsafe?.user?.first_name || validation.user?.first_name, 120);
    const phone = normalizePhone(contact?.phone || form.phone);
    const address = sanitizeText(form.address, 300);
    const objectType = sanitizeText(form.objectType, 120);
    const mountingType = sanitizeText(form.mountingType, 120);
    const openingType = sanitizeText(form.openingType, 120);
    const expectedDate = sanitizeText(form.expectedDate, 120);
    const comment = sanitizeText(form.comment, 1500);
    const needInstall = typeof form.needInstall === 'boolean' ? form.needInstall : !String(mountingType).toLowerCase().includes('только');
    const needZippers = Boolean(form.needZippers);
    const leadMode = sanitizeText(form.leadMode, 40) === 'estimate' ? 'estimate' : 'measure';
    const requestType = sanitizeText(form.requestType || (leadMode === 'estimate' ? 'Знаю размеры — хочу узнать стоимость' : 'Не знаю размеры — хочу бесплатный замер'), 160);
    const requiresWindows = leadMode === 'estimate';

    const windows = Array.isArray(form.windows) ? form.windows.slice(0, 30).map((w) => ({
      widthCm: compactNumber(w.widthCm),
      heightCm: compactNumber(w.heightCm),
      count: Math.max(1, Math.min(99, compactNumber(w.count, 1)))
    })).filter((w) => w.widthCm > 0 && w.heightCm > 0) : [];

    if (!phone && !name) {
      return res.status(400).json({ ok: false, error: 'Укажите имя или телефон' });
    }
    if (requiresWindows && !windows.length) {
      return res.status(400).json({ ok: false, error: 'Добавьте хотя бы один размер проёма' });
    }

    const duplicateInfo = await findRecentDuplicate({ phone, visitorId });
    const combinedComment = [requestType, comment].filter(Boolean).join('\n');

    const normalizedForm = {
      leadMode,
      requestType,
      name,
      phone,
      address,
      objectType,
      mountingType: mountingType || (needInstall ? 'С монтажом' : 'Только изготовление'),
      openingType: normalizeOpeningType(openingType),
      needInstall,
      expectedDate,
      needZippers,
      comment,
      windows
    };
    const serverEstimate = calculateServerEstimate(normalizedForm, estimate);

    const lead = {
      form: normalizedForm,
      phone,
      estimate: serverEstimate,
      contact,
      photoDataUrl,
      photoInfo,
      maxUser: validation.user || maxUnsafe?.user || null,
      maxChat: validation.chat || maxUnsafe?.chat || null,
      initDataValid: validation.ok,
      validationReason: validation.reason,
      source: attribution.source || sanitizeText(body.source || 'max-miniapp', 80),
      attribution,
      visitorId,
      visitId,
      consent,
      userAgent: sanitizeText(req.headers['user-agent'], 500),
      duplicate: duplicateInfo ? { type: duplicateInfo.type, lead_id: duplicateInfo.lead?.id || null, created_at: duplicateInfo.lead?.created_at || null } : null
    };

    const fullLeadRow = {
      name,
      phone,
      address,
      object_type: objectType,
      mounting_type: mountingType,
      expected_date: expectedDate,
      need_zippers: needZippers,
      comment: combinedComment,
      windows,
      area_m2: lead.estimate.areaM2,
      estimated_total: lead.estimate.total,
      price_per_m2: lead.estimate.pricePerM2,
      install_per_m2: lead.estimate.installPerM2,
      install_total: lead.estimate.install,
      zipper_total: lead.estimate.zippers,
      photo_data_url: photoDataUrl || null,
      photo_info: photoInfo,
      max_user_id: lead.maxUser?.id || null,
      max_username: lead.maxUser?.username || null,
      max_chat_id: lead.maxChat?.id || null,
      init_data_valid: validation.ok,
      validation_reason: validation.reason,
      crm_status: duplicateInfo ? 'duplicate' : 'new',
      visitor_id: visitorId || null,
      visit_id: visitId || null,
      privacy_consent: Boolean(consent.privacyConsent),
      ad_consent: Boolean(consent.adConsent),
      consent_text: consent.consentText || null,
      consent_at: consent.consentAt || null,
      source: attribution.source || null,
      utm_source: attribution.utm_source || null,
      utm_medium: attribution.utm_medium || null,
      utm_campaign: attribution.utm_campaign || null,
      utm_content: attribution.utm_content || null,
      utm_term: attribution.utm_term || null,
      ref_chat_id: attribution.ref_chat_id || null,
      landing_url: attribution.landing_url || null,
      raw_payload: lead
    };

    const safeLeadRow = {
      name,
      phone,
      address,
      object_type: objectType,
      comment: combinedComment,
      windows,
      area_m2: lead.estimate.areaM2,
      estimated_total: lead.estimate.total,
      price_per_m2: lead.estimate.pricePerM2,
      max_user_id: lead.maxUser?.id || null,
      max_username: lead.maxUser?.username || null,
      max_chat_id: lead.maxChat?.id || null,
      init_data_valid: validation.ok,
      validation_reason: validation.reason,
      raw_payload: lead
    };

    let saved = null;
    let saveWarning = null;
    if (hasSupabase()) {
      try {
        saved = await supabaseFetch('max_miniapp_leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify(fullLeadRow)
        });
      } catch (error) {
        const message = String(error.message || '');
        if (message.includes('PGRST204') || message.includes('Could not find')) {
          saveWarning = 'Supabase schema is outdated. Saved lead with legacy columns only. Run supabase/hotfix-miniapp-columns.sql.';
          saved = await supabaseFetch('max_miniapp_leads', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Prefer: 'return=representation'
            },
            body: JSON.stringify(safeLeadRow)
          });
        } else {
          throw error;
        }
      }
    }

    const savedId = Array.isArray(saved) && saved[0] ? saved[0].id : null;

    let crm = { skipped: true };
    try {
      crm = await tryCrmIntegration(lead, savedId);
    } catch (error) {
      crm = { ok: false, error: error.message };
    }

    if (savedId && hasSupabase()) {
      try {
        await supabaseFetch(`max_miniapp_leads?id=eq.${encodeURIComponent(savedId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            crm_result: { integration: crm, synced_at: new Date().toISOString() },
            crm_updated_at: new Date().toISOString(),
            crm_updated_by: 'miniapp-submit'
          })
        });
      } catch (error) {
        if (isMissingColumnError(error)) {
          try {
            await supabaseFetch(`max_miniapp_leads?id=eq.${encodeURIComponent(savedId)}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
              },
              body: JSON.stringify({ crm_result: { integration: crm, synced_at: new Date().toISOString() } })
            });
          } catch (innerError) {
            console.warn('CRM result patch warning', innerError.message);
          }
        } else {
          console.warn('CRM result patch warning', error.message);
        }
      }
    }

    let notification = { skipped: true };
    try {
      notification = await notifyAdmin(lead, savedId);
    } catch (error) {
      notification = { ok: false, error: error.message };
    }

    return res.status(200).json({
      ok: true,
      saved: Boolean(saved),
      leadId: savedId,
      initDataValid: validation.ok,
      validationReason: validation.reason,
      crm,
      notification,
      saveWarning
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
