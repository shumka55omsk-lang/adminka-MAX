# v50 CRM opening checkbox fix

Исправление для CRM мягких окон: дашборд фиксировал сумму только после ручной установки галочки «Глухие» / «Открывающиеся» в расчёте.

## Что исправлено

```text
✅ mini app по-прежнему передаёт выбор клиента: Глухие / Открывающиеся
✅ в расчёт CRM теперь записываются legacy-чекбоксы типа изделия
✅ флаги записываются в items[], totals, prices, materials и snapshot расчёта
✅ добавлены точные ключи строки ручного калькулятора CRM: ed, inst, z, zq, zc, zd
✅ добавлены алиасы глухих: g, gluh, gluhie, deaf, fixed, blind, closed
✅ добавлены алиасы открывающихся: o, open, opening, openable, otkr, otkryv
✅ сумма остаётся в totals.grandTotal и дополнительных полях v49
```

## Проверка

После загрузки в GitHub и Redeploy:

```text
https://adminka-max.vercel.app/api/version
```

Ожидаемо:

```json
"version": "v50-crm-opening-checkbox-fix"
```

Проверять нужно новой заявкой через сценарий «Знаю размеры».
