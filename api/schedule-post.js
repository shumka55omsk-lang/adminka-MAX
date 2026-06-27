import { requireAdmin, serializeFetchError } from './_max.js';
import { hasSupabase, supabaseFetch } from './_supabase.js';
import { normalizeButtons, normalizeChatIds } from './_sendCore.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb'
    }
  }
};

function parseScheduledAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (!requireAdmin(req, res)) return;

    if (!hasSupabase()) {
      return res.status(400).json({ ok: false, error: 'Для расписания нужен Supabase. Добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.' });
    }

    const { chatIds, groupNames, text, buttons, imageDataUrl, scheduledAt } = req.body || {};
    const cleanText = String(text || '').trim();
    if (!cleanText || cleanText.length < 3) {
      return res.status(400).json({ ok: false, error: 'Введите текст поста' });
    }
    if (cleanText.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Текст MAX-сообщения должен быть до 4000 символов' });
    }

    const { invalidChatIds, uniqueChatIds } = normalizeChatIds(chatIds);
    if (invalidChatIds.length) {
      return res.status(400).json({ ok: false, error: 'Некорректный chat_id в выбранных группах', invalidChatIds });
    }
    if (!uniqueChatIds.length) {
      return res.status(400).json({ ok: false, error: 'Выберите хотя бы одну группу' });
    }
    if (uniqueChatIds.length > 30) {
      return res.status(400).json({ ok: false, error: 'За один запланированный пост можно выбрать максимум 30 групп' });
    }

    const date = parseScheduledAt(scheduledAt);
    if (!date) {
      return res.status(400).json({ ok: false, error: 'Некорректная дата/время отправки' });
    }

    const now = Date.now();
    if (date.getTime() < now - 60 * 1000) {
      return res.status(400).json({ ok: false, error: 'Нельзя запланировать пост в прошлом' });
    }

    const safeButtons = normalizeButtons(buttons);
    const imageString = imageDataUrl ? String(imageDataUrl) : null;
    if (imageString && imageString.length > 8 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'Фото слишком большое для хранения в расписании. Сожмите изображение до 6 МБ.' });
    }

    const cleanGroupNames = Array.isArray(groupNames)
      ? groupNames.map((name) => String(name || '').trim()).filter(Boolean).slice(0, 50)
      : [];

    const rows = [{
      post_text: cleanText,
      chat_ids: uniqueChatIds,
      group_names: cleanGroupNames,
      buttons: safeButtons,
      image_data_url: imageString,
      has_image: Boolean(imageString),
      scheduled_at: date.toISOString(),
      status: 'scheduled'
    }];

    const data = await supabaseFetch('max_scheduled_posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(rows)
    });

    return res.status(200).json({ ok: true, scheduled: data?.[0] || null });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, details: serializeFetchError(error) });
  }
}
