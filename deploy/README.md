# Продакшен

Две VPS у одного провайдера в одном дата-центре, связанные приватной сетью, плюс Cloudflare.

```
                    Игроки (Telegram Mini App)
                                │ HTTPS / WSS
                                ▼
┌───────────────────────── Cloudflare ─────────────────────────┐
│  DNS · TLS · WAF · rate limit                                 │
│  app.<домен>  ──►  Cloudflare Pages (frontend/dist)           │
│  api.<домен>  ──►  Cloudflare Tunnel                          │
└───────────────────────────────┬───────────────────────────────┘
                                │ исходящий туннель, входящих портов нет
                                ▼
┌──────────── VPS 1 · игровая (2–4 vCPU, 4–8 ГБ) ────────────┐
│  cloudflared ──► C++ game backend :8080 (HTTP + WebSocket)  │
└───────────────────────────────┬────────────────────────────┘
                                │ приватная сеть, AMQP 5672
                                ▼
┌──────── VPS 2 · финансовая (2–4 vCPU, 4–8 ГБ) ─────────────┐
│  RabbitMQ ◄──► chain-service (Go) ──► PostgreSQL            │
│     ▲                 └──► toncenter API ──► TON            │
│     └──► сервис подписи (отдельная сеть, без портов)        │
└─────────────────────────────────────────────────────────────┘
```

Когда через кошелёк пойдут заметные суммы, сервис подписи переезжает на третью VPS (1–2 vCPU, 1–2 ГБ) без входящих портов: он только подключается к RabbitMQ, код не меняется.

| Папка | Что |
|---|---|
| [`game/`](game) | compose игровой VPS: backend + cloudflared, firewall |
| [`finance/`](finance) | compose финансовой VPS: RabbitMQ, PostgreSQL, chain-service, сервис подписи; пользователи RabbitMQ, firewall, бэкап |

## Порядок запуска

1. **Сервера.** Две VPS (Ubuntu 24.04), приватная сеть между ними, Docker. SSH только по ключу (`PasswordAuthentication no`), лучше через WireGuard.
2. **Firewall.** `game/firewall.sh` и `finance/firewall.sh` (параметры в шапке файлов). Docker публикует порты в обход ufw, поэтому в compose порты либо не публикуются, либо привязаны к `127.0.0.1` / приватному адресу.
3. **Финансовая VPS** (`/opt/poker/finance`):
   ```bash
   cp .env.example .env && cp chain-service.env.example chain-service.env && chmod 600 .env chain-service.env
   docker login registry.gitlab.com
   docker compose up -d
   docker compose exec rabbitmq sh /etc/rabbitmq/users.sh
   ```
   Бэкап: `backup.sh` в cron (строка в шапке файла).
4. **Cloudflare Tunnel.** Zero Trust → Networks → Tunnels → Create (Docker). Public hostname `api.<домен>` → `http://backend:8080`. Токен — в `game/.env`.
5. **Игровая VPS** (`/opt/poker/game`):
   ```bash
   cp .env.example .env && chmod 600 .env
   docker compose up -d
   ```
6. **Cloudflare Pages.** Проект «Direct Upload», production branch `main`, домен `app.<домен>`. В GitLab → Settings → CI/CD → Variables: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT`, `VITE_APP_URL=https://app.<домен>`, `VITE_API_URL=https://api.<домен>`, `VITE_MOCK_SERVER=false`, `VITE_TON_NETWORK=mainnet`. Пуш в `main` собирает и выкладывает фронт (джоба `frontend:cloudflare-pages`).

## Cloudflare

- **SSL/TLS:** Full (strict). До origin трафик идёт по туннелю, сертификат на VPS не нужен.
- **WebSocket:** Cloudflare закрывает соединение после 100 с без трафика. Клиент шлёт `{"type":"CMD_PING"}` раз в 30 с; бэкенд должен его игнорировать. Ещё лучше — WebSocket ping-фреймы со стороны сервера (Boost.Beast: `websocket::stream_base::timeout::suggested(role_type::server)` с `keep_alive_pings = true`).
- **Кэш:** правило Bypass cache для `api.<домен>`. Заголовки и кэш фронта — в [`frontend/public/_headers`](../frontend/public/_headers).
- **Безопасность:** rate limiting на `/auth/*`. Bot Fight Mode на `api.<домен>` не включать: он ломает запросы из Telegram WebView.

## RabbitMQ: кто что может

| Пользователь | Публикует | Читает |
|---|---|---|
| `chain-service` | `deposits`, `withdrawals.result` | `withdrawals.signed` |
| `core` (game backend) | `withdrawals.requested` | `deposits`, `withdrawals.result` |
| `signer` | `withdrawals.signed` | `withdrawals.requested` |

Все публикуют в exchange `core.events`. Ядро принимает депозиты и результаты выводов только с `user_id = chain-service` (см. [`chain-service/README.md`](../chain-service/README.md)).

**Открытые вопросы:**
- имя очереди запросов на вывод (здесь `withdrawals.requested`);
- `withdrawals.result` нужен и ядру, и подписанту: из одной очереди два потребителя заберут сообщения по очереди, а не каждый по копии. Нужны две очереди, привязанные к одному routing key;
- ключ идемпотентности для запросов на вывод и лимиты сумм в сервисе подписи;
- образ сервиса подписи, переменные и формат ключа (`finance/secrets/signer_key`).

## Обновление

```bash
docker compose pull && docker compose up -d
```

Состояние столов живёт в памяти game backend: перезапуск обрывает текущие раздачи. Обновлять игровую VPS лучше в тихие часы.
