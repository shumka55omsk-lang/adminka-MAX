import { requireAdmin } from './_max.js';
import { hasSupabase, supabaseFetch } from './_supabase.js';

const DEFAULT_TEMPLATES = [
  {
    key: 'soft',
    title: 'Мягкие окна',
    text: 'Мягкие окна в Омске\n\nИзготовление и установка мягких окон для беседок, веранд и террас.\nПВХ-плёнка, окантовка, люверсы/скобы, аккуратный монтаж.\n\nБесплатный замер. Напишите — рассчитаем стоимость по размерам.'
  },
  {
    key: 'eva',
    title: 'EVA коврики',
    text: 'EVA коврики в Омске\n\nИзготовим коврики под ваш автомобиль.\nПодбор по марке, модели и году. Аккуратная окантовка, разные цвета.\n\nНапишите марку авто — рассчитаем стоимость.'
  },
  {
    key: 'promo',
    title: 'Акция',
    text: 'Акция на мягкие окна\n\nДля беседок, веранд и террас.\nЗамер, изготовление и монтаж в Омске и области.\n\nНапишите сегодня — рассчитаем стоимость и подскажем оптимальный вариант крепления.'
  }
];

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (!requireAdmin(req, res)) return;

    if (req.method === 'GET') {
      if (!hasSupabase()) {
        return res.status(200).json({ ok: true, storage: 'default', templates: DEFAULT_TEMPLATES });
      }

      const rows = await supabaseFetch('max_templates?select=id,key,title,text,active,created_at&active=eq.true&order=title.asc', {
        method: 'GET'
      });
      return res.status(200).json({ ok: true, storage: 'supabase', templates: Array.isArray(rows) && rows.length ? rows : DEFAULT_TEMPLATES });
    }

    if (!hasSupabase()) {
      return res.status(400).json({ ok: false, error: 'Supabase не настроен. Сохранение шаблонов работает только с Supabase.' });
    }

    const payload = {
      key: String(req.body?.key || '').trim().toLowerCase(),
      title: String(req.body?.title || '').trim(),
      text: String(req.body?.text || '').trim(),
      active: req.body?.active !== false
    };

    if (!payload.key || !/^[a-z0-9_-]{2,40}$/.test(payload.key)) throw new Error('Некорректный key шаблона');
    if (!payload.title) throw new Error('Введите название шаблона');
    if (!payload.text || payload.text.length < 3) throw new Error('Введите текст шаблона');

    const result = await supabaseFetch('max_templates?on_conflict=key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });

    return res.status(200).json({ ok: true, template: Array.isArray(result) ? result[0] : result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
