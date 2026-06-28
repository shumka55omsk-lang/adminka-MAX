# MAX Admin MVP v21 — Button Row Fix

Исправление ошибки MAX API:

```json
{
  "code": "proto.payload",
  "message": "errors.maxRowSize"
}
```

Причина: в одном ряду inline-клавиатуры было слишком много кнопок. В v21 кнопки под постом отправляются по одной в строку:

```text
[Рассчитать стоимость]
[WhatsApp]
[Telegram]
[Сайт]
```

## Что сохранено

- админка рассылки;
- расписание постов;
- фото в постах;
- кнопка мини-приложения;
- UTM-метки;
- статистика заявок;
- цены из Supabase;
- мини-приложение `/miniapp`;
- совместимость с Vercel Hobby: одна функция `api/[...route].js`.

## Как обновить

1. Залей файлы v21 на GitHub поверх текущего проекта.
2. Убедись, что в папке `api` только один файл:

```text
api/[...route].js
```

3. Убедись, что в корне нет `vercel.json`.
4. Сделай Redeploy в Vercel.
5. Проверь версию:

```text
https://adminka-max.vercel.app/api/version
```

Должно быть:

```json
{
  "ok": true,
  "version": "v21-button-row-fix"
}
```

Supabase обновлять не нужно.
