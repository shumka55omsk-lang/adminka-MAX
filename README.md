# MAX Admin MVP — v28 Growth Suite

Версия v28 объединяет 9 улучшений поверх рабочей v27/v26: CRM-доску, календарь публикаций, библиотеку шаблонов, рейтинг групп, квиз mini app, диапазон цены, экран после заявки, улучшенные уведомления, антидубли/антиспам и CSV-экспорты.

## Что есть в v28

- CRM-доска заявок из мини-приложения.
- Календарный вид расписания с дублированием постов.
- Библиотека рекламных шаблонов с сохранением в Supabase.
- Рейтинг групп MAX: посты, переходы, заявки, конверсия, ошибки.
- Mini app в формате квиза по шагам.
- Клиент видит диапазон стоимости, а не точную формулу/тарифы.
- Красивый экран “Заявка принята” с кнопками WhatsApp/Telegram.
- Уведомления в MAX стали богаче и получили кнопки связи/CRM.
- Антиспам: honeypot + пометка дублей по телефону/посетителю.
- Экспорты CSV: заявки, кампании, группы, Яндекс-аудитории.

## Проверка версии

После деплоя откройте:

```text
/api/version
```

Должно быть:

```json
{
  "ok": true,
  "version": "v28-growth-suite"
}
```

## Supabase

Примените в SQL Editor:

```text
supabase/hotfix-v28-growth-suite.sql
```

Если таблицы v22–v27 уже применялись, hotfix безопасен: команды `if not exists` не ломают существующие данные.


## v34 Mini App Post Integration

В рекламный пост MAX теперь можно автоматически добавить кнопки мини-приложения:

- `Заказать бесплатный замер` → `/miniapp?flow=measure&...utm...`
- `Узнать стоимость` → `/miniapp?flow=estimate&...utm...`

Mini app считывает `flow`/`mode` из ссылки и сразу выбирает нужный сценарий. UTM сохраняются в визитах и заявках.


## v39 Estimate to Soft Windows CRM

Заявки из сценария **«Знаю размеры»** теперь дополнительно пишутся в основную CRM мягких окон: `clients`, `calculations`, `client_history`.

Для работы в Vercel включите:

```text
CRM_INTEGRATION_ENABLED=true
CRM_LEGACY_DIRECT_ENABLED=true
```

Сценарий **«Не знаю размеры»** остаётся в mini app CRM как заявка на бесплатный замер и не создаёт расчёт без размеров.


## v40: заявки ‘Знаю размеры’ в отдельную CRM мягких окон

Если CRM мягких окон работает на другой Supabase-базе, добавьте в Vercel проекта adminka-MAX:

```text
CRM_SUPABASE_URL=<SUPABASE_URL из проекта CRM мягких окон>
CRM_SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY из проекта CRM мягких окон>
CRM_REQUIRE_DEDICATED_SUPABASE=true
CRM_INTEGRATION_ENABLED=true
CRM_LEGACY_DIRECT_ENABLED=true
```

Иначе заявка сохранится в MAX-админке, но не появится в старой CRM, потому что в базе adminka-MAX нет таблиц `clients`, `calculations`, `client_history`.
