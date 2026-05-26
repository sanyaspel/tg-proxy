# TG Proxy

Автоматически обновляемый список рабочих MTProto прокси для Telegram.

**→ [Открыть страницу с прокси](https://YOUR_USERNAME.github.io/tg-proxy)**

## Как пользоваться

1. Открой страницу выше в браузере
2. Нажми **Подключить** на любом прокси
3. Telegram откроется и сам добавит прокси

Работает без VPN и без доступа к Telegram заранее.

## Как это работает

GitHub Actions каждые 30 минут:
1. Парсит публичные Telegram-каналы с прокси через `t.me/s/` (веб-версия, без Telegram)
2. Проверяет каждый прокси на доступность
3. Публикует рабочие на GitHub Pages

## Источники прокси

- [@ProxyMTProto](https://t.me/s/ProxyMTProto)
- [@mtpro_xyz](https://t.me/s/mtpro_xyz)
- [@FreeProxyMTProto](https://t.me/s/FreeProxyMTProto)

## Настройка (для своего форка)

1. Форкни репозиторий
2. Settings → Pages → Source: **Deploy from branch**, branch: `main`, folder: `/docs`
3. Settings → Actions → General → Workflow permissions: **Read and write**
4. Готово — первый запуск через Actions → Update Proxies → Run workflow
