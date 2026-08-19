# V51 — CRM native autosave total

Исправление фиксации суммы на дашборде старой CRM мягких окон.

## Что изменено

- Расчёт из mini app сохраняется в формате, который создаёт сама CRM после ручного переключения галочки «глухое / открывающееся».
- В `items[]` добавлены нативные поля строки CRM: `index`, `w`, `h1`, `h2`, `mh`, `qty`, `ed`, `straps`, `z`, `zq`, `zc`, `zd`, `open`, `door`, `inst`.
- В `totals` добавлена нативная структура CRM: `totalQty`, `totalArea`, `baseTotal`, `extraTotal`, `grandTotal`, `rows`.
- После INSERT расчёта выполняется PATCH этого же расчёта теми же нативными полями, как при автосохранении в CRM.
- После сохранения расчёта обновляется `clients.updated_at`, как делает ручной `saveCalc()` в CRM.
- Запись истории создаётся с типом `Расчёт`.

## Проверка

После деплоя открыть:

```text
https://adminka-max.vercel.app/api/version
```

Ожидаемая версия:

```text
v51-crm-native-autosave-total
```
