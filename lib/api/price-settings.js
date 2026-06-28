import { requireAdmin } from './_max.js';
import { hasSupabase, supabaseFetch } from './_supabase.js';

export const DEFAULT_PRICE_SETTINGS = {
  manufacturing_price_per_m2: 1500,
  installation_price_per_m2: 500,
  zipper_price_per_opening: 700,
  min_order_price: 5000
};

const DESCRIPTIONS = {
  manufacturing_price_per_m2: 'Цена изготовления мягкого окна за 1 м², ₽',
  installation_price_per_m2: 'Цена монтажа за 1 м², ₽',
  zipper_price_per_opening: 'Доплата за молнию на один проём, ₽',
  min_order_price: 'Минимальная сумма заказа, ₽'
};

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function normalizeSettings(input = {}) {
  return {
    manufacturing_price_per_m2: toNumber(input.manufacturing_price_per_m2, DEFAULT_PRICE_SETTINGS.manufacturing_price_per_m2),
    installation_price_per_m2: toNumber(input.installation_price_per_m2, DEFAULT_PRICE_SETTINGS.installation_price_per_m2),
    zipper_price_per_opening: toNumber(input.zipper_price_per_opening, DEFAULT_PRICE_SETTINGS.zipper_price_per_opening),
    min_order_price: toNumber(input.min_order_price, DEFAULT_PRICE_SETTINGS.min_order_price)
  };
}

async function readSettings() {
  if (!hasSupabase()) return { storage: 'default', settings: DEFAULT_PRICE_SETTINGS };

  const rows = await supabaseFetch('max_price_settings?select=key,value,description,updated_at&active=eq.true', { method: 'GET' });
  const merged = { ...DEFAULT_PRICE_SETTINGS };
  for (const row of Array.isArray(rows) ? rows : []) {
    if (Object.prototype.hasOwnProperty.call(merged, row.key)) {
      merged[row.key] = toNumber(row.value, merged[row.key]);
    }
  }
  return { storage: 'supabase', settings: merged, rows };
}

async function saveSettings(settings) {
  if (!hasSupabase()) throw new Error('Supabase не настроен. Добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.');
  const normalized = normalizeSettings(settings);
  const rows = Object.entries(normalized).map(([key, value]) => ({
    key,
    value,
    description: DESCRIPTIONS[key] || key,
    active: true
  }));

  const result = await supabaseFetch('max_price_settings?on_conflict=key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(rows)
  });
  return { settings: normalized, rows: result };
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (req.method === 'GET') {
      const result = await readSettings();
      return res.status(200).json({ ok: true, ...result, defaults: DEFAULT_PRICE_SETTINGS });
    }

    if (!requireAdmin(req, res)) return;
    const result = await saveSettings(req.body || {});
    return res.status(200).json({ ok: true, storage: 'supabase', ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
