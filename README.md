# MAX Admin MVP v18 Schema Fix

Исправление ошибки Supabase `PGRST204: Could not find the 'crm_status' column`.

Что сделано:

- добавлен fallback: если Supabase schema cache ещё не видит новые колонки, заявка всё равно сохраняется в старые базовые поля;
- добавлен файл `supabase/hotfix-miniapp-columns.sql`;
- версия API: `v18-schema-fix`;
- `vercel.json` отсутствует, проект совместим с Vercel Hobby;
- в папке `api` должна быть только одна функция: `api/[...route].js`.

## Обязательный быстрый фикс

В Supabase → SQL Editor выполните файл:

```text
supabase/hotfix-miniapp-columns.sql
```

Потом сделайте Redeploy на Vercel.

## Проверка

Откройте:

```text
https://adminka-max.vercel.app/api/version
```

Должно быть:

```json
{ "ok": true, "version": "v18-schema-fix" }
```
