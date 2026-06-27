import checkChat from '../lib/api/check-chat.js';
import cronSendScheduled from '../lib/api/cron-send-scheduled.js';
import diagnostics from '../lib/api/diagnostics.js';
import groups from '../lib/api/groups.js';
import history from '../lib/api/history.js';
import maxWebhook from '../lib/api/max-webhook.js';
import miniappLeads from '../lib/api/miniapp-leads.js';
import miniappSubmit from '../lib/api/miniapp-submit.js';
import schedulePost from '../lib/api/schedule-post.js';
import scheduledPosts from '../lib/api/scheduled-posts.js';
import sendMaxPost from '../lib/api/send-max-post.js';
import templates from '../lib/api/templates.js';
import webhookSubscription from '../lib/api/webhook-subscription.js';

const VERSION = {
  ok: true,
  version: 'v17-no-vercel-json',
  builtAt: '2026-06-28T01:35:00Z',
  miniappUrl: '/miniapp',
  apiMode: 'single-catch-all-function',
  reason: 'Vercel Hobby compatible router + no vercel.json to avoid invalid config deployment error'
};

const routes = new Map([
  ['check-chat', checkChat],
  ['cron-send-scheduled', cronSendScheduled],
  ['diagnostics', diagnostics],
  ['groups', groups],
  ['history', history],
  ['max-webhook', maxWebhook],
  ['miniapp-leads', miniappLeads],
  ['miniapp-submit', miniappSubmit],
  ['schedule-post', schedulePost],
  ['scheduled-posts', scheduledPosts],
  ['send-max-post', sendMaxPost],
  ['templates', templates],
  ['webhook-subscription', webhookSubscription]
]);

function getRouteName(req) {
  const fromQuery = req.query?.route;
  if (Array.isArray(fromQuery)) return fromQuery.join('/').replace(/^\/+|\/+$/g, '');
  if (typeof fromQuery === 'string') return fromQuery.replace(/^\/+|\/+$/g, '');

  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `https://${host}`);
  return url.pathname.replace(/^\/api\/?/, '').replace(/^\/+|\/+$/g, '');
}

export default async function handler(req, res) {
  const routeName = getRouteName(req);

  if (!routeName) {
    return res.status(200).json({
      ok: true,
      version: VERSION.version,
      apiMode: VERSION.apiMode,
      routes: ['version', ...Array.from(routes.keys()).sort()]
    });
  }

  if (routeName === 'version') {
    return res.status(200).json(VERSION);
  }

  const routeHandler = routes.get(routeName);
  if (!routeHandler) {
    return res.status(404).json({
      ok: false,
      error: 'API route not found',
      route: routeName,
      availableRoutes: ['version', ...Array.from(routes.keys()).sort()]
    });
  }

  return routeHandler(req, res);
}
