# v55 Scheduled Posting Cron Fix

Что исправлено:

- Добавлен рабочий `vercel.json` с Vercel Cron.
- Cron вызывает `/api/cron-send-scheduled` каждые 15 минут.
- Роут расписания теперь принимает штатный Vercel Cron даже если `CRON_SECRET` ещё не задан.
- Ручная кнопка в админке «Запустить проверку сейчас» сохранена.
- v55 включает предыдущие изменения v53/v54: корректный коэффициент открывания только на изготовление и удаление заявок mini app.

После деплоя проверить:

```
https://adminka-max.vercel.app/api/version
```

Должно быть:

```json
"version": "v55-scheduled-posting-cron-fix"
```

Если в Vercel есть переменная `CRON_SECRET`, Vercel Cron будет авторизоваться через `Authorization: Bearer CRON_SECRET`. Если переменной нет, разрешается штатный запрос Vercel Cron по служебным заголовкам.
