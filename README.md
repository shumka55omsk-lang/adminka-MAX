# MAX Admin MVP v15 — Hobby Router Fix + Mini App

Версия v15 исправляет ошибку Vercel Hobby:

```text
No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan
```

## Что изменено

В v14 каждая папка/файл в `api/*.js` превращалась в отдельную Serverless Function. На бесплатном Hobby-плане Vercel это упёрлось в лимит.

В v15 все API объединены в одну функцию:

```text
api/[...route].js
```

Внутренние обработчики перенесены в:

```text
lib/api/
```

Старые адреса остаются теми же:

```text
/api/groups
/api/send-max-post
/api/max-webhook
/api/miniapp-submit
/api/cron-send-scheduled
/api/version
```

То есть фронтенд, Webhook MAX, мини-приложение и расписание продолжают работать по прежним URL.

## Что есть в проекте

- Админка рассылки MAX.
- Webhook MAX.
- Supabase: группы, история, шаблоны, расписание, заявки мини-приложения.
- Расписание постов.
- Мини-приложение `/miniapp` для заявки на мягкие окна.
- Один серверный API-router для Vercel Hobby.

## Как обновить

1. Залей содержимое архива в корень GitHub-репозитория.
2. Убедись, что папка `api` содержит только один файл:

```text
api/[...route].js
```

3. Убедись, что папка `lib/api` содержит остальные обработчики.
4. Сделай Redeploy в Vercel.
5. Проверь версию:

```text
https://adminka-max.vercel.app/api/version
```

Должно быть:

```json
{
  "ok": true,
  "version": "v15-hobby-router"
}
```

## Supabase

Если ты уже запускал SQL из v14, повторно запускать необязательно. Если таблицы мини-приложения ещё нет, выполни:

```text
supabase/schema.sql
```

## Важно про GitHub

Не оставляй старые API-файлы в папке `api`:

```text
api/groups.js
api/send-max-post.js
api/diagnostics.js
...
```

Иначе Vercel снова посчитает их отдельными функциями и деплой упадёт на Hobby-плане.

В папке `api` должен быть только:

```text
[...route].js
```

## Переменные Vercel

Оставь прежние переменные:

```text
MAX_BOT_TOKEN
ADMIN_PASSWORD
MAX_API_BASE_URL=https://platform-api.max.ru
MAX_TLS_MODE=default
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PUBLIC_BASE_URL=https://adminka-max.vercel.app
MAX_WEBHOOK_SECRET
CRON_SECRET
MAX_NOTIFY_CHAT_ID=
MINIAPP_ALLOW_UNVERIFIED=true
MINIAPP_REQUIRE_FRESH_AUTH=false
MINIAPP_AUTH_MAX_AGE_SECONDS=3600
```

После изменения переменных всегда делай Redeploy.
