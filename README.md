# MAX Admin MVP v14 — Mini App

Это продолжение работающей админки рассылки MAX. В v14 добавлено мини-приложение для чат-бота MAX: клиент открывает форму внутри MAX, вводит размеры мягких окон, получает предварительный расчёт и отправляет заявку.

## Что добавлено

- `/miniapp` — клиентское мини-приложение для MAX.
- `api/miniapp-submit.js` — приём заявок из мини-приложения.
- `api/miniapp-leads.js` — просмотр последних заявок через админский пароль.
- `api/_maxWebApp.js` — проверка подписи `window.WebApp.initData` по алгоритму MAX.
- `max_miniapp_leads` — таблица Supabase для заявок.
- Опциональное уведомление о заявке в MAX через `MAX_NOTIFY_CHAT_ID`.

## Ссылка мини-приложения

После деплоя на Vercel мини-приложение будет доступно по адресу:

```text
https://adminka-max.vercel.app/miniapp
```

Именно эту ссылку нужно вставить в настройках бота MAX.

## Как подключить мини-приложение к боту MAX

1. Откройте платформу MAX для партнёров.
2. Перейдите: `Чат-боты → Перейти → Расширенные настройки → Настроить`.
3. Вставьте URL мини-приложения, например:

```text
https://adminka-max.vercel.app/miniapp
```

4. Выберите вид кнопки открытия: `Открыть`, `Старт`, `Играть` или без названия.
5. Нажмите `Сохранить`.

По требованиям MAX URL мини-приложения должен быть HTTPS, валидный, без пробелов и длиной не более 1024 символов.

## Обновление Supabase

Выполните в Supabase SQL Editor содержимое файла:

```text
supabase/schema.sql
```

После этого появится таблица:

```text
max_miniapp_leads
```

## Переменные Vercel

Старые переменные оставить как есть:

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
```

Новые переменные для мини-приложения:

```text
MAX_NOTIFY_CHAT_ID=
MINIAPP_ALLOW_UNVERIFIED=true
MINIAPP_REQUIRE_FRESH_AUTH=false
MINIAPP_AUTH_MAX_AGE_SECONDS=3600
```

### MAX_NOTIFY_CHAT_ID

Если указать `MAX_NOTIFY_CHAT_ID`, бот будет присылать уведомление о новой заявке в этот чат MAX.

Для начала можно оставить пустым. Заявки всё равно будут сохраняться в Supabase.

### MINIAPP_ALLOW_UNVERIFIED

- `true` — форма работает даже при открытии в обычном браузере. Удобно для теста.
- `false` — заявка принимается только если `initData` MAX прошёл проверку подписи. Лучше для production.

## Как проверить

1. Залейте v14 на Vercel.
2. Выполните `supabase/schema.sql`.
3. Откройте:

```text
https://adminka-max.vercel.app/api/version
```

Должно быть:

```json
{
  "ok": true,
  "version": "v14-miniapp"
}
```

4. Откройте:

```text
https://adminka-max.vercel.app/miniapp
```

5. Отправьте тестовую заявку.
6. Проверьте Supabase:

```text
Table Editor → max_miniapp_leads
```

## Что делает мини-приложение

Клиент видит форму:

- имя;
- телефон;
- кнопка `Подставить номер из MAX` через `window.WebApp.requestContact()`;
- адрес / район;
- тип объекта;
- размеры проёмов;
- предварительная площадь и цена;
- комментарий;
- отправка заявки.

Предварительный расчёт сейчас стоит по формуле:

```text
площадь × 1500 ₽/м²
```

Это можно изменить в `public/miniapp/index.html`, константа:

```js
const PRICE_PER_M2 = 1500;
```

## Безопасность

MAX Bridge передаёт `window.WebApp.initData`; сервер проверяет подпись по токену бота. Для теста можно оставить `MINIAPP_ALLOW_UNVERIFIED=true`, но после проверки лучше поставить:

```text
MINIAPP_ALLOW_UNVERIFIED=false
MINIAPP_REQUIRE_FRESH_AUTH=true
```

После изменения переменных обязательно сделать Redeploy.
