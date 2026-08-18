# v40 — External CRM Supabase sync

Причина ошибки v39: проект `adminka-MAX` использует свою Supabase-базу, а в ней нет таблиц старой CRM мягких окон `clients`, `calculations`, `client_history`. Поэтому заявка сохранялась в `max_miniapp_leads` и в очередь `max_crm_leads`, но не появлялась в основной CRM.

## Что добавлено

- Поддержка отдельной базы CRM мягких окон через переменные:
  - `CRM_SUPABASE_URL`
  - `CRM_SUPABASE_SERVICE_ROLE_KEY`
- По умолчанию v40 требует отдельную CRM-базу: `CRM_REQUIRE_DEDICATED_SUPABASE=true`.
- Если эти переменные не заданы, в `crm_result` будет понятная ошибка, а не молчаливый провал.

## Какие переменные нужны в Vercel проекта adminka-MAX

```text
CRM_INTEGRATION_ENABLED=true
CRM_LEGACY_DIRECT_ENABLED=true
CRM_REQUIRE_DEDICATED_SUPABASE=true
CRM_SUPABASE_URL=<URL из проекта CRM мягкие окна>
CRM_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY из проекта CRM мягкие окна>
```

`SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` оставьте как есть — это база админки MAX.

## Где взять CRM_SUPABASE_URL и CRM_SUPABASE_SERVICE_ROLE_KEY

В проекте, где работает старая CRM мягких окон:

```text
Vercel → CRM project → Settings → Environment Variables
```

Скопировать значения `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` из CRM-проекта и вставить их в проект `adminka-MAX` под новыми именами:

```text
CRM_SUPABASE_URL
CRM_SUPABASE_SERVICE_ROLE_KEY
```

После этого сделать Redeploy и отправить новую тестовую заявку из сценария “Знаю размеры”.
