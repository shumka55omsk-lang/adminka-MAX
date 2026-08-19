# v49 fixed v48 dashboard total

Исправление ошибки сборки v48.

В архиве v48 логика `lib/api/miniapp-submit.js` была обновлена, но рабочий catch-all файл `api/[...route].js` остался с версией `v47-crm-safe-legacy-sync`. Из-за этого `/api/version` показывал v47 даже после загрузки архива.

В v49 исправлено:

```text
✅ api/[...route].js теперь показывает v49-fixed-v48-dashboard-total
✅ сохранена логика v48 для передачи суммы в JSON-поля расчёта CRM
✅ mini app не показывает предварительную стоимость клиенту
✅ open_app и короткие ссылки сохранены
```

После загрузки проверь:

```text
https://adminka-max.vercel.app/api/version
```

Должно быть:

```json
"version": "v49-fixed-v48-dashboard-total"
```
