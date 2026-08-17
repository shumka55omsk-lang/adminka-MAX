# Настройка домена www.zamer55.ru для mini app

Цель: клиентские кнопки в рекламных постах MAX должны открывать mini app по адресу:

```text
https://www.zamer55.ru/miniapp
```

Админка может оставаться на техническом домене Vercel:

```text
https://adminka-max.vercel.app
```

## 1. Добавить домен в Vercel

Vercel → Project `adminka-MAX` → Settings → Domains → Add:

```text
www.zamer55.ru
```

Можно также добавить корневой домен:

```text
zamer55.ru
```

и сделать redirect на `www.zamer55.ru`.

## 2. DNS у регистратора

Для `www.zamer55.ru` добавьте CNAME:

```text
Тип: CNAME
Имя / Host: www
Значение / Value: cname.vercel-dns.com
```

Если Vercel в карточке домена покажет другое CNAME-значение, используйте именно то, что показывает Vercel.

Для корневого `zamer55.ru`, если нужен редирект, обычно используется A-запись:

```text
Тип: A
Имя / Host: @
Значение / Value: 76.76.21.21
```

## 3. Environment Variable в Vercel

Vercel → Project `adminka-MAX` → Settings → Environment Variables:

```text
MINIAPP_PUBLIC_URL=https://www.zamer55.ru/miniapp
```

После добавления переменной сделать Redeploy.

## 4. Проверка

Проверить версию:

```text
https://adminka-max.vercel.app/api/version
```

Должно быть:

```json
{"ok":true,"version":"v35-zamer55-domain"}
```

Проверить mini app:

```text
https://www.zamer55.ru/miniapp?v=35
```

Проверить ссылку в рекламном посте:

```text
https://www.zamer55.ru/miniapp?flow=measure&utm_source=max_group&utm_campaign=...
```
