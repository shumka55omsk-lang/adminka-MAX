# MAX Admin MVP v17 — No vercel.json Fix

Эта версия исправляет ошибку Vercel `Invalid vercel.json file provided`.

Главное изменение: файл `vercel.json` удалён полностью. Для этого проекта он не нужен: Vercel сам отдаёт `public/index.html`, `public/miniapp/index.html` и одну API-функцию `api/[...route].js`.

## Важно при обновлении GitHub

В корне репозитория НЕ должно быть файла:

```text
vercel.json
```

Если он остался от старой версии, удалите его на GitHub.

В папке `api` должен быть только один файл:

```text
api/[...route].js
```

Старые API-файлы нужно удалить, иначе Vercel Hobby снова может выдать лимит Serverless Functions.

## Проверка

После деплоя откройте:

```text
https://adminka-max.vercel.app/api/version
```

Должно быть:

```json
{
  "ok": true,
  "version": "v17-no-vercel-json"
}
```

## Supabase

Если SQL из v16 уже запускался, повторно запускать `supabase/schema.sql` не обязательно. Если таблицы `max_miniapp_leads` и `max_crm_leads` ещё не созданы — запустите SQL из файла `supabase/schema.sql`.

## Мини-приложение

Адрес мини-приложения:

```text
https://adminka-max.vercel.app/miniapp
```

