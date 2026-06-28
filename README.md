# MAX Admin MVP v20 — Post → Mini App Tracking

Версия v20 связывает рекламные посты бота MAX с мини-приложением:

- кнопка “Рассчитать стоимость” в рекламных постах;
- UTM-метки `source`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`;
- мини-приложение сохраняет источник заявки в Supabase;
- админка показывает базовую статистику заявок по кампаниям;
- цены мини-приложения по-прежнему берутся из Supabase;
- совместимо с Vercel Hobby: одна API-функция `api/[...route].js`;
- `vercel.json` не нужен.

## Проверка версии

После деплоя откройте:

```text
https://adminka-max.vercel.app/api/version
```

Ожидаемый ответ:

```json
{"ok":true,"version":"v20-post-miniapp-tracking"}
```

## Обновление Supabase

Выполните весь файл:

```text
supabase/schema.sql
```

Или только быстрый фикс:

```text
supabase/hotfix-lead-tracking.sql
```

Он добавит колонки:

```text
source
utm_source
utm_medium
utm_campaign
utm_content
utm_term
ref_chat_id
landing_url
```

## Как пользоваться

1. Откройте админку.
2. Введите пароль.
3. В блоке “Кнопки под постом” оставьте включённой галочку “Добавить кнопку Рассчитать стоимость”.
4. Укажите `UTM кампания`, например `besedki_july`.
5. Укажите `UTM content`, например `post_1`.
6. Отправьте пост сразу или запланируйте.
7. Клиент нажимает кнопку “Рассчитать стоимость”, открывает `/miniapp`, оставляет заявку.
8. Источник заявки сохраняется в `max_miniapp_leads`.
9. В админке нажмите “Обновить статистику”.

## Важно

В папке `api` должен быть только один файл:

```text
api/[...route].js
```

В корне проекта не должно быть `vercel.json`, если вы используете Vercel Hobby.
