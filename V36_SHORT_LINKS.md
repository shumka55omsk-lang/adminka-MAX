# v36 — короткие ссылки mini app для MAX/iPhone

Задача: убрать длинную ссылку из всплывающего окна MAX на iPhone.

## Что изменено

В рекламных постах кнопки mini app теперь по умолчанию используют короткие ссылки:

- `https://www.zamer55.ru/z?...` — заявка на бесплатный замер
- `https://www.zamer55.ru/s?...` — расчёт стоимости по известным размерам

После открытия короткая страница автоматически переводит клиента в:

- `/miniapp?flow=measure...`
- `/miniapp?flow=estimate...`

UTM-метки сохраняются, но в окне MAX больше не показывается огромный URL.

## Переменные Vercel

```env
MINIAPP_PUBLIC_URL=https://www.zamer55.ru/miniapp
MINIAPP_BUTTON_TYPE=short_link
MAX_OPEN_APP_WEB_APP=id550507026940_bot
```

`MINIAPP_BUTTON_TYPE=short_link` — рекомендуемый режим.

`MINIAPP_BUTTON_TYPE=open_app` — экспериментальный режим, если мини-приложение подключено в настройках бота MAX. В этом режиме отправляется кнопка:

```json
{
  "type": "open_app",
  "text": "Узнать стоимость",
  "web_app": "id550507026940_bot",
  "payload": "..."
}
```

## Важно

Перед включением `open_app` нужно в MAX для бизнеса / настройках бота указать URL мини-приложения:

```text
https://www.zamer55.ru/miniapp
```

Если `open_app` не сработает — верните `MINIAPP_BUTTON_TYPE=short_link` и сделайте Redeploy.
