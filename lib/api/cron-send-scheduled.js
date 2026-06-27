import { requireToken, serializeFetchError } from './_max.js';
import { saveSendLogs } from './_logs.js';
import { hasSupabase, supabaseFetch, escapePostgrestValue } from './_supabase.js';
import { normalizeButtons, normalizeChatIds, sendToChats } from './_sendCore.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb'
    }
  }
};

function isAuthorizedCron(req) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const providedAdminPassword = String(req.headers['x-admin-password'] || '');
  if (adminPassword && providedAdminPassword && providedAdminPassword === adminPassword) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = String(req.headers.authorization || '');
  return auth === `Bearer ${secret}`;
}

async function markPost(id, patch) {
  return supabaseFetch(`max_scheduled_posts?id=eq.${escapePostgrestValue(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(patch)
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (!isAuthorizedCron(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized cron request' });
    }

    if (!hasSupabase()) {
      return res.status(400).json({ ok: false, error: 'Supabase не настроен' });
    }

    if (!requireToken(res)) return;

    const limit = Math.min(Number(req.query?.limit || 5) || 5, 10);
    const now = new Date().toISOString();

    const duePosts = await supabaseFetch(
      `max_scheduled_posts?select=*&status=eq.scheduled&scheduled_at=lte.${escapePostgrestValue(now)}&order=scheduled_at.asc&limit=${limit}`
    );

    const results = [];

    for (const post of duePosts || []) {
      await markPost(post.id, {
        status: 'processing',
        attempt_count: Number(post.attempt_count || 0) + 1,
        last_error: null
      });

      try {
        const { invalidChatIds, uniqueChatIds } = normalizeChatIds(post.chat_ids || []);
        if (invalidChatIds.length || !uniqueChatIds.length) {
          throw new Error('Некорректные chat_ids в запланированном посте: ' + JSON.stringify(post.chat_ids || []));
        }

        const buttons = normalizeButtons(post.buttons || []);
        const sendResult = await sendToChats({
          chatIds: uniqueChatIds,
          text: String(post.post_text || '').trim(),
          buttons,
          imageDataUrl: post.image_data_url || null,
          delayBetweenMs: 150
        });

        const logResult = await saveSendLogs({
          text: post.post_text,
          buttons,
          chatIds: uniqueChatIds,
          results: sendResult.results,
          hasImage: sendResult.hasImage
        }).catch((error) => ({ saved: false, error: error.message }));

        const finalStatus = sendResult.failed === 0 ? 'sent' : 'failed';
        await markPost(post.id, {
          status: finalStatus,
          sent_at: new Date().toISOString(),
          result: { ...sendResult, log: logResult },
          last_error: sendResult.failed === 0 ? null : 'Часть отправок завершилась ошибкой'
        });

        results.push({ id: post.id, ok: sendResult.ok, status: finalStatus, sent: sendResult.sent, failed: sendResult.failed });
      } catch (error) {
        await markPost(post.id, {
          status: 'failed',
          last_error: error.message,
          result: { ok: false, error: error.message, details: serializeFetchError(error) }
        });
        results.push({ id: post.id, ok: false, status: 'failed', error: error.message });
      }
    }

    return res.status(200).json({ ok: true, checkedAt: now, picked: duePosts?.length || 0, results });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, details: serializeFetchError(error) });
  }
}
