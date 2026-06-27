import { supabaseFetch, hasSupabase } from './_supabase.js';
import { maxFetch } from './_max.js';
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

function buildLeadText(lead) {
  const f = lead.form || {};
  const estimate = lead.estimate || {};
  const lines = [];
  lines.push('🪟 Новая заявка из мини-приложения MAX');
  lines.push('');
  lines.push(`Имя: ${f.name || 'не указано'}`);
  lines.push(`Телефон: ${lead.phone || f.phone || 'не указан'}`);
  lines.push(`Адрес: ${f.address || 'не указан'}`);
  lines.push(`Тип объекта: ${f.objectType || 'не указан'}`);
  if (estimate.areaM2) lines.push(`Площадь: ${estimate.areaM2} м²`);
  if (estimate.total) lines.push(`Предварительно: ${estimate.total} ₽`);
  if (Array.isArray(f.windows) && f.windows.length) {
    lines.push('');
    lines.push('Размеры:');
    f.windows.slice(0, 12).forEach((w, i) => {
      lines.push(`${i + 1}) ${w.widthCm || 0}×${w.heightCm || 0} см × ${w.count || 1} шт.`);
    });
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
  return lines.join('\n').slice(0, 3500);
}

async function notifyAdmin(lead) {
  const notifyChatId = String(process.env.MAX_NOTIFY_CHAT_ID || '').trim();
  if (!notifyChatId) return { skipped: true, reason: 'MAX_NOTIFY_CHAT_ID not set' };

  const text = buildLeadText(lead);
  const result = await maxFetch(`/messages?chat_id=${encodeURIComponent(notifyChatId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  return result;
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

    const name = sanitizeText(form.name || maxUnsafe?.user?.first_name || validation.user?.first_name, 120);
    const phone = normalizePhone(contact?.phone || form.phone);
    const address = sanitizeText(form.address, 300);
    const objectType = sanitizeText(form.objectType, 120);
    const comment = sanitizeText(form.comment, 1500);

    const windows = Array.isArray(form.windows) ? form.windows.slice(0, 30).map((w) => ({
      widthCm: compactNumber(w.widthCm),
      heightCm: compactNumber(w.heightCm),
      count: Math.max(1, Math.min(99, compactNumber(w.count, 1)))
    })).filter((w) => w.widthCm > 0 && w.heightCm > 0) : [];

    if (!phone && !name) {
      return res.status(400).json({ ok: false, error: 'Укажите имя или телефон' });
    }

    const lead = {
      form: { name, phone, address, objectType, comment, windows },
      phone,
      estimate: {
        areaM2: compactNumber(estimate.areaM2),
        total: Math.round(compactNumber(estimate.total)),
        pricePerM2: compactNumber(estimate.pricePerM2)
      },
      contact,
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
          comment,
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
        })
      });
    }

    let notification = { skipped: true };
    try {
      notification = await notifyAdmin(lead);
    } catch (error) {
      notification = { ok: false, error: error.message };
    }

    return res.status(200).json({
      ok: true,
      saved: Boolean(saved),
      leadId: Array.isArray(saved) && saved[0] ? saved[0].id : null,
      initDataValid: validation.ok,
      validationReason: validation.reason,
      notification
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
