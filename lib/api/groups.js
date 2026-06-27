import { requireAdmin } from './_max.js';
import { escapePostgrestValue, hasSupabase, supabaseFetch } from './_supabase.js';

function readEnvGroups() {
  const raw = process.env.MAX_GROUPS || '[]';
  try {
    const groups = JSON.parse(raw);
    if (!Array.isArray(groups)) return [];
    return groups
      .filter((g) => g && g.active !== false && g.name && g.chat_id !== undefined)
      .map((g) => ({ name: String(g.name), chat_id: Number(g.chat_id), active: true }))
      .filter((g) => Number.isSafeInteger(g.chat_id) && g.chat_id !== 0);
  } catch {
    return [];
  }
}

async function readDbGroups() {
  const rows = await supabaseFetch('max_groups?select=id,name,chat_id,active,source,last_update_type,last_event_at,created_at,updated_at&active=eq.true&order=name.asc', {
    method: 'GET'
  });
  return (Array.isArray(rows) ? rows : []).map((g) => ({
    id: g.id,
    name: String(g.name),
    chat_id: Number(g.chat_id),
    active: g.active !== false,
    created_at: g.created_at,
    source: g.source || 'manual',
    last_update_type: g.last_update_type || null,
    last_event_at: g.last_event_at || null
  }));
}

async function upsertDbGroup(group) {
  const payload = {
    name: String(group.name || '').trim(),
    chat_id: Number(group.chat_id),
    active: group.active !== false,
    source: 'manual',
    last_update_type: 'manual_upsert',
    last_event_at: new Date().toISOString()
  };

  if (!payload.name) throw new Error('Введите название группы');
  if (!Number.isSafeInteger(payload.chat_id) || payload.chat_id === 0) {
    throw new Error('Некорректный chat_id. Он не может быть пустым или равным 0.');
  }

  return supabaseFetch('max_groups?on_conflict=chat_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(payload)
  });
}

async function deactivateDbGroup(chatId) {
  const numericChatId = Number(chatId);
  if (!Number.isSafeInteger(numericChatId) || numericChatId === 0) throw new Error('Некорректный chat_id');

  return supabaseFetch(`max_groups?chat_id=eq.${escapePostgrestValue(numericChatId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ active: false })
  });
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (!requireAdmin(req, res)) return;

    if (req.method === 'GET') {
      const groups = hasSupabase() ? await readDbGroups() : readEnvGroups();
      return res.status(200).json({ ok: true, storage: hasSupabase() ? 'supabase' : 'env', groups });
    }

    if (!hasSupabase()) {
      return res.status(400).json({ ok: false, error: 'Supabase не настроен. Добавление/удаление групп работает только с Supabase.' });
    }

    if (req.method === 'POST') {
      const result = await upsertDbGroup(req.body || {});
      return res.status(200).json({ ok: true, group: Array.isArray(result) ? result[0] : result });
    }

    if (req.method === 'DELETE') {
      const result = await deactivateDbGroup(req.body?.chat_id);
      return res.status(200).json({ ok: true, result });
    }
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
