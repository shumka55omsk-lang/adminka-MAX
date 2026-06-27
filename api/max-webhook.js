import { getMaxApiBaseUrl, authHeaders } from './_max.js';
import { hasSupabase, supabaseFetch } from './_supabase.js';

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectChatIds(value, found = new Set()) {
  if (!value || typeof value !== 'object') return found;
  if (Object.prototype.hasOwnProperty.call(value, 'chat_id')) {
    const id = Number(value.chat_id);
    if (Number.isFinite(id)) found.add(id);
  }
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object') collectChatIds(item, found);
  }
  return found;
}

function getUpdateType(update) {
  return String(update?.update_type || update?.type || 'unknown');
}

function makeFallbackName(update, chatId) {
  const direct = update?.chat?.title || update?.chat?.name || update?.title || update?.name;
  if (direct) return String(direct);
  const type = getUpdateType(update);
  const isChannel = update?.is_channel === true;
  return `${isChannel ? 'Канал' : 'Группа'} MAX ${chatId} (${type})`;
}

async function fetchChatName(chatId) {
  try {
    const response = await fetch(`${getMaxApiBaseUrl()}/chats/${encodeURIComponent(chatId)}`, {
      method: 'GET',
      headers: authHeaders()
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) return null;
    return data.title || data.name || data.chat?.title || data.chat?.name || null;
  } catch {
    return null;
  }
}

async function upsertGroupFromUpdate(update, chatId) {
  const updateType = getUpdateType(update);
  const active = updateType !== 'bot_removed';
  const apiName = active ? await fetchChatName(chatId) : null;
  const payload = {
    chat_id: Number(chatId),
    name: apiName || makeFallbackName(update, chatId),
    active,
    source: 'webhook',
    last_update_type: updateType,
    last_event_at: new Date().toISOString()
  };

  return supabaseFetch('max_groups?on_conflict=chat_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(payload)
  });
}

async function saveWebhookEvent(update, chatIds, savedGroups, error = null) {
  if (!hasSupabase()) return { saved: false, reason: 'Supabase не настроен' };
  try {
    const payload = {
      update_type: getUpdateType(update),
      chat_ids: chatIds,
      payload: update,
      processed_ok: !error,
      error: error ? String(error.message || error) : null,
      saved_groups: savedGroups || []
    };
    const rows = await supabaseFetch('max_webhook_events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    return { saved: true, event: Array.isArray(rows) ? rows[0] : rows };
  } catch (eventError) {
    return { saved: false, error: eventError.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const expectedSecret = process.env.MAX_WEBHOOK_SECRET;
  if (expectedSecret) {
    const actualSecret = req.headers['x-max-bot-api-secret'];
    if (actualSecret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
    }
  }

  const updates = asArray(req.body);
  const results = [];

  for (const update of updates) {
    const chatIds = Array.from(collectChatIds(update));
    const savedGroups = [];
    let processingError = null;

    try {
      if (!hasSupabase()) {
        throw new Error('Supabase не настроен. Webhook получил событие, но не может сохранить группу.');
      }

      for (const chatId of chatIds) {
        const saved = await upsertGroupFromUpdate(update, chatId);
        savedGroups.push({ chat_id: chatId, saved: Array.isArray(saved) ? saved[0] : saved });
      }
    } catch (error) {
      processingError = error;
    }

    const eventLog = await saveWebhookEvent(update, chatIds, savedGroups, processingError);
    results.push({
      update_type: getUpdateType(update),
      chatIds,
      savedGroupsCount: savedGroups.length,
      error: processingError ? processingError.message : null,
      eventLog
    });
  }

  return res.status(200).json({ ok: true, results });
}
