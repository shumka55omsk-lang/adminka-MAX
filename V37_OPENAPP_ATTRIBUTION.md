# v37 — Open App attribution fix

Проблема v36: кнопки `open_app` открывали mini app и выбирали сценарий, но в заявке могло отображаться:

```text
Источник — · без кампании · без поста
```

Причина: при `open_app` MAX не всегда передаёт обычные URL-параметры как внешняя ссылка. Поэтому UTM нужно читать не только из `window.location.search`, но и из payload/start-параметров mini app.

Что изменено:

- Mini App теперь ищет payload в нескольких местах:
  - `WebApp.initDataUnsafe.start_param`
  - `WebApp.initDataUnsafe.startParam`
  - `WebApp.initDataUnsafe.payload`
  - `WebApp.initData`
  - URL/hash fallback
- Перед отправкой заявки атрибуция пересчитывается заново.
- В `/api/miniapp-submit` добавлен серверный fallback: если клиент не передал UTM, API пытается восстановить кампанию/пост из open app payload.
- В `/api/miniapp-visit` добавлен такой же fallback для статистики переходов.
- Короткие ссылки `/z` и `/s` оставлены как запасной вариант.

Проверка после деплоя:

1. Открыть `/api/version` — должна быть версия `v37-openapp-attribution`.
2. Отправить тестовый пост в одну группу MAX с `MINIAPP_BUTTON_TYPE=open_app`.
3. Открыть mini app кнопкой “Заказать бесплатный замер”.
4. Отправить тестовую заявку.
5. Проверить в админке: источник должен быть `max_group`, кампания и пост должны заполниться.
6. Повторить для кнопки “Узнать стоимость”.
