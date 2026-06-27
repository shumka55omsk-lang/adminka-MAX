import { supabaseFetch, hasSupabase } from './_supabase.js';
import { maxFetch } from './_max.js';
import { sendToChats } from './_sendCore.js';
import { validateMaxWebAppData, isMaxAuthFresh } from './_maxWebApp.js';

function sanitizeText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9+]/g, '').slice(0, 32);
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

function buildLeadText(lead, savedId = null) {
  const f = lead.form || {};
  const estimate = lead.estimate || {};
  const lines = [];
  lines.push('🪟 Новая заявка на замер из MAX');
  if (savedId) lines.push(`ID заявки: ${savedId}`);
  lines.push('');
  lines.push(`Имя: ${f.name || 'не указано'}`);
  lines.push(`Телефон: ${lead.phone || f.phone || 'не указан'}`);
  lines.push(`Адрес: ${f.address || 'не указан'}`);
  lines.push(`Тип объекта: ${f.objectType || 'не указан'}`);
  lines.push(`Замер: ${f.expectedDate || 'не указано'}`);
  lines.push(`Формат: ${f.mountingType || 'не указано'}`);
  lines.push(`Молнии: ${f.needZippers ? 'нужны' : 'не указаны / не нужны'}`);
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

async function notifyAdmin(lead, savedId = null) {
  const notifyChatId = String(process.env.MAX_NOTIFY_CHAT_ID || '').trim();
  if (!notifyChatId) return { skipped: true, reason: 'MAX_NOTIFY_CHAT_ID not set' };

  const text = buildLeadText(lead, savedId);
  if (lead.photoDataUrl) {
    return sendToChats({
      chatIds: [Number(notifyChatId)],
      text,
      buttons: [],
      imageDataUrl: lead.photoDataUrl,
      delayBetweenMs: 0
    });
  }

  const result = await maxFetch(`/messages?chat_id=${encodeURIComponent(notifyChatId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  return result;
}

async function tryCrmIntegration(lead, savedLeadId) {
  const enabled = String(process.env.CRM_INTEGRATION_ENABLED || 'false').toLowerCase() === 'true';
  if (!enabled || !hasSupabase()) return { skipped: true, reason: 'CRM_INTEGRATION_ENABLED is not true' };

  const f = lead.form || {};
  const estimate = lead.estimate || {};

  // Безопасная интеграция: сначала пишем в специальную очередь max_crm_leads.
  // Если основная CRM использует свои таблицы clients/calculations, дальше её можно обработать отдельным импортом без риска сломать заявку.
  try {
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
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
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

    const name = sanitizeText(form.name || maxUnsafe?.user?.first_name || validation.user?.first_name, 120);
    const phone = normalizePhone(contact?.phone || form.phone);
    const address = sanitizeText(form.address, 300);
    const objectType = sanitizeText(form.objectType, 120);
    const mountingType = sanitizeText(form.mountingType, 120);
    const expectedDate = sanitizeText(form.expectedDate, 120);
    const comment = sanitizeText(form.comment, 1500);
    const needZippers = Boolean(form.needZippers);

    const windows = Array.isArray(form.windows) ? form.windows.slice(0, 30).map((w) => ({
      widthCm: compactNumber(w.widthCm),
      heightCm: compactNumber(w.heightCm),
      count: Math.max(1, Math.min(99, compactNumber(w.count, 1)))
    })).filter((w) => w.widthCm > 0 && w.heightCm > 0) : [];

    if (!phone && !name) {
      return res.status(400).json({ ok: false, error: 'Укажите имя или телефон' });
    }
    if (!windows.length) {
      return res.status(400).json({ ok: false, error: 'Добавьте хотя бы один размер проёма' });
    }

    const lead = {
      form: { name, phone, address, objectType, mountingType, expectedDate, needZippers, comment, windows },
      phone,
      estimate: {
        areaM2: compactNumber(estimate.areaM2),
        openingsCount: compactNumber(estimate.openingsCount),
        base: Math.round(compactNumber(estimate.base)),
        install: Math.round(compactNumber(estimate.install)),
        zippers: Math.round(compactNumber(estimate.zippers)),
        total: Math.round(compactNumber(estimate.total)),
        pricePerM2: compactNumber(estimate.pricePerM2),
        installPerM2: compactNumber(estimate.installPerM2),
        zipperPerOpening: compactNumber(estimate.zipperPerOpening),
        objectFactor: compactNumber(estimate.objectFactor, 1),
        minOrder: compactNumber(estimate.minOrder)
      },
      contact,
      photoDataUrl,
      photoInfo,
      maxUser: validation.user || maxUnsafe?.user || null,
      maxChat: validation.chat || maxUnsafe?.chat || null,
      initDataValid: validation.ok,
      validationReason: validation.reason,
      source: sanitizeText(body.source || 'max-miniapp', 80),
      userAgent: sanitizeText(req.headers['user-agent'], 500)
    };

    let saved = null;
    if (hasSupabase()) {
      saved = await supabaseFetch('max_miniapp_leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          name,
          phone,
          address,
          object_type: objectType,
          mounting_type: mountingType,
          expected_date: expectedDate,
          need_zippers: needZippers,
          comment,
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
          crm_status: 'new',
          raw_payload: lead
        })
      });
    }

    const savedId = Array.isArray(saved) && saved[0] ? saved[0].id : null;

    let crm = { skipped: true };
    try {
      crm = await tryCrmIntegration(lead, savedId);
    } catch (error) {
      crm = { ok: false, error: error.message };
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
      notification
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
