# MAX Admin MVP v4 + Supabase + Webhook

Админка для рассылки постов в группы MAX через официального бота.

## Что добавлено в v4

```text
✅ автоматическое получение chat_id через Webhook MAX
✅ автосохранение групп в Supabase при событии bot_added / message_created
✅ отключение группы при событии bot_removed
✅ таблица событий max_webhook_events для диагностики
✅ кнопка “Подключить Webhook” прямо в админке
✅ кнопка “Проверить подписки”
```

## Структура

```text
public/index.html                — веб-админка
api/_max.js                      — общие настройки MAX API
api/_supabase.js                 — общий клиент Supabase через REST
api/_logs.js                     — запись истории отправок
api/groups.js                    — группы: получить / добавить / отключить
api/templates.js                 — шаблоны: получить / сохранить
api/history.js                   — история: получить / очистить
api/check-chat.js                — проверка доступа бота к группе
api/send-max-post.js             — отправка поста с текстом, фото и кнопками
api/max-webhook.js               — endpoint, куда MAX отправляет события
api/webhook-subscription.js      — подключение и проверка Webhook-подписок
supabase/schema.sql              — SQL для создания/обновления таблиц
.env.example                     — пример переменных окружения
vercel.json                      — настройки Vercel
```

## 1. Создать или обновить таблицы Supabase

Откройте:

```text
Supabase → SQL Editor → New query
```

Вставьте весь файл:

```text
supabase/schema.sql
```

Нажмите `Run`.

Будут созданы/обновлены таблицы:

```text
max_groups          — группы MAX
max_templates       — шаблоны постов
max_send_logs       — история отправок
max_webhook_events  — входящие события Webhook
```

Если таблицы от v3 уже были созданы, этот SQL безопасно добавит новые поля и новую таблицу.

## 2. Добавить переменные в Vercel

В Vercel откройте:

```text
Project → Settings → Environment Variables
```

Добавьте:

```text
MAX_BOT_TOKEN = токен бота MAX
ADMIN_PASSWORD = пароль для админки
MAX_API_BASE_URL = https://platform-api2.max.ru
PUBLIC_BASE_URL = https://your-project.vercel.app
MAX_WEBHOOK_SECRET = свой_секрет_без_пробелов
SUPABASE_URL = https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY = service_role key из Supabase
```

Важно:

```text
SUPABASE_SERVICE_ROLE_KEY — только service_role, не anon public key.
MAX_WEBHOOK_SECRET — только латиница, цифры, _ или -, длина 5-256 символов.
PUBLIC_BASE_URL — полный HTTPS-адрес админки на Vercel.
```

## 3. Подключить Webhook

После деплоя:

```text
1. Открыть сайт админки
2. Ввести ADMIN_PASSWORD
3. Проверить, что в поле Webhook указан адрес вида:
   https://your-project.vercel.app/api/max-webhook
4. Нажать “Подключить Webhook”
5. Нажать “Проверить подписки”
```

Админка сама отправит запрос в MAX:

```text
POST /subscriptions
```

И подпишется на события:

```text
bot_added
bot_removed
chat_title_changed
message_created
```

## 4. Как теперь получить chat_id автоматически

```text
1. Добавьте бота в группу MAX
2. Напишите в группе любое сообщение или дождитесь события bot_added
3. MAX отправит событие на /api/max-webhook
4. Endpoint сохранит chat_id в Supabase → max_groups
5. В админке нажмите “Загрузить группы”
```

Если бот удалён из группы, событие `bot_removed` пометит группу как неактивную.

## 5. Ручное добавление группы всё ещё работает

```text
1. Ввести название группы
2. Вставить chat_id
3. Нажать “Добавить / обновить группу”
```

Ручной способ нужен, если Webhook ещё не подключён.

## 6. Как пользоваться рассылкой

```text
1. Открыть админку
2. Ввести пароль
3. Нажать “Загрузить группы”
4. Выбрать группы галочками
5. Написать текст поста
6. При необходимости прикрепить фото
7. Проверить кнопки WhatsApp / Telegram / сайт / звонок
8. Нажать “Отправить в MAX”
```

После отправки в `max_send_logs` появятся строки по каждой группе.

## 7. Диагностика Webhook

Если группы не появляются:

```text
1. Проверьте PUBLIC_BASE_URL в Vercel
2. Проверьте MAX_WEBHOOK_SECRET
3. Нажмите “Проверить подписки”
4. Откройте Supabase → Table Editor → max_webhook_events
5. Посмотрите последние события и поле error
```

Webhook должен быть доступен по HTTPS. Vercel подходит.

## 8. Безопасность

Не публикуйте в GitHub:

```text
MAX_BOT_TOKEN
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PASSWORD
MAX_WEBHOOK_SECRET
```

Все эти значения должны быть только в Vercel Environment Variables.

## 9. Что добавить следующим шагом

```text
- планировщик публикаций
- роли пользователей
- отдельные проекты: мягкие окна / EVA / 3D товары
- библиотека фото
- отчёт по успешным/ошибочным отправкам
- удаление/редактирование групп из интерфейса
```
