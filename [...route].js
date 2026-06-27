# MAX Admin MVP v16 — Mini App Pro

Версия v16 улучшает мини-приложение для чат-бота MAX и сохраняет совместимость с бесплатным Vercel Hobby: в папке `api` остаётся только одна Serverless Function `api/[...route].js`.

## Что добавлено в мини-приложение `/miniapp`

```text
✅ красивый дизайн под мягкие окна
✅ выбор типа объекта: беседка / веранда / терраса / кафе / навес / другое
✅ загрузка фото замера с предпросмотром
✅ автоматическое сжатие фото в браузере
✅ автоматический расчёт стоимости
✅ опции: с монтажом / только изготовление
✅ опции: без молний / нужны молнии
✅ поле “Когда удобно на замер”
✅ кнопка “Заказать замер”
✅ сохранение заявки в Supabase
✅ отправка заявки тебе в MAX через MAX_NOTIFY_CHAT_ID
✅ если есть фото — бот отправляет заявку с фото
✅ очередь интеграции с CRM: таблица max_crm_leads
```

## Проверка версии

После деплоя открой:

```text
https://adminka-max.vercel.app/api/version
```

Должно быть:

```json
{
  "ok": true,
  "version": "v16-miniapp-pro"
}
```

## Как обновить

1. Залей содержимое архива в корень GitHub-репозитория.
2. Убедись, что в папке `api` только один файл:

```text
api/[...route].js
```

3. Старые файлы `api/groups.js`, `api/send-max-post.js`, `api/miniapp-submit.js` и т.п. должны быть удалены.
4. Сделай Redeploy в Vercel.
5. Открой `/miniapp` и проверь форму.

## Обновление Supabase

В Supabase выполни файл:

```text
supabase/schema.sql
```

Он безопасно добавит новые поля и таблицу:

```text
max_crm_leads
```

Основная таблица заявок:

```text
max_miniapp_leads
```

Новые поля в заявках:

```text
mounting_type
expected_date
need_zippers
install_per_m2
install_total
zipper_total
photo_data_url
photo_info
crm_status
crm_result
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

Для уведомлений о заявке в MAX заполни:

```text
MAX_NOTIFY_CHAT_ID=твой_chat_id
```

Для CRM-очереди можно включить:

```text
CRM_INTEGRATION_ENABLED=true
```

Тогда каждая заявка дополнительно будет попадать в таблицу:

```text
max_crm_leads
```

Если переменную не включать, заявки всё равно сохраняются в `max_miniapp_leads`.

## Как получить MAX_NOTIFY_CHAT_ID

Самый простой вариант:

1. Создай служебную группу MAX, например “Заявки MAX”.
2. Добавь туда бота.
3. Напиши в группе любое сообщение.
4. Открой Supabase → `max_groups`.
5. Скопируй `chat_id` этой группы.
6. Вставь его в Vercel как `MAX_NOTIFY_CHAT_ID`.
7. Сделай Redeploy.

## Важно про фото

Фото сжимается в браузере примерно до 1–1.3 МБ и сохраняется в Supabase как `photo_data_url`. Для MVP это удобно. В будущем лучше вынести фото в Supabase Storage, если заявок станет много.

## Важно про Vercel Hobby

Не добавляй новые файлы в папку `api`, иначе Vercel снова может упереться в лимит Serverless Functions. Все новые обработчики добавляй в `lib/api`, а маршруты — в `api/[...route].js`.
