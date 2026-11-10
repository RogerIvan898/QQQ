# chain-service

Go-сервис между ядром покер-рума и сетью TON. Работает через RabbitMQ:

| Очередь | Направление | Событие | Кто пишет → кто читает |
|---|---|---|---|
| `withdrawals` | вход | `WITHDRAW_REQUESTED` | ядро → chain-service |
| `withdrawals.signed` | выход | `WITHDRAW_SIGNED` | chain-service → Broadcaster |
| `withdrawals.result` | вход | `WITHDRAW_RESULT` | Broadcaster → chain-service |
| `deposits` | выход | `DEPOSIT_DETECTED` | chain-service (watcher) → ядро |

Один процесс делает всё сразу, в независимых горутинах:

- **подпись**: `withdrawals` → подпись → `withdrawals.signed`, плюс приём `withdrawals.result`;
- **broadcaster**: `withdrawals.signed` → отправка в TON (toncenter) → `withdrawals.result`: `sent`, затем `confirmed` / `failed`;
- **watcher**: транзакции кошелька депозитов (toncenter) → `deposits`.

Задавать ничего не нужно. Если позже понадобится вынести подпись (единственную часть, которой нужен приватный ключ) в отдельный контейнер, есть необязательная переменная `MODE`: `consumer`, `broadcaster` или `watcher` (по умолчанию `all`).

> **Подпись сейчас заглушка.** `StubSigner` не подписывает ничего по-настоящему. Чтобы никто случайно не выкатил заглушку, сервис не стартует без `ALLOW_STUB_SIGNER=true`. Настоящая подпись подключается через интерфейс `handler.Signer` (tonutils-go, ключ из KMS/Vault). Broadcaster и watcher уже умеют работать с настоящим toncenter (`TON_CLIENT=toncenter`), но BOC от заглушки сеть отвергнет — поэтому в compose стоит `TON_CLIENT=stub`.

## Запуск

Docker:

```bash
docker compose up --build
```

RabbitMQ UI — http://localhost:15672 (`chain` / `chain`), метрики — http://localhost:9090/metrics.

Локально (нужен Go ≥ 1.26, запущенные RabbitMQ и MySQL 8):

```bash
cp .env.example .env
set -a && . ./.env && set +a
go run ./cmd/chain-service
```

Проверки:

```bash
go build ./... && go vet ./... && go test ./...
```

Тестовый запрос на вывод — в UI RabbitMQ: *Exchanges → core.events → Publish message*, routing key `withdrawals`, header `message_id` = любой UUID, property `content_type` = `application/json`, тело:

```json
{ "request_id": "1b4e28ba-2fa1-11d2-883f-0016d3cca427", "user_id": 123, "amount": "50.0", "asset": "TON",
  "to_address": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c" }
```

В `withdrawals.signed` появится `{ "request_id": "...", "boc": "base64...", "seqno": 1 }`, broadcaster отправит его (в compose — заглушкой), и в логах появятся результаты `sent`, затем `confirmed`. Состояние — в таблице `withdrawals`.

## Broadcaster и MySQL

Схема ([`internal/store/schema.sql`](internal/store/schema.sql)) применяется при старте: `processed_messages` (ключи идемпотентности с TTL) и `withdrawals` (одна строка на `request_id`: seqno, BOC, его sha256, статус `signed → sent → confirmed | failed`, хэши сообщения и транзакции).

- **Подпись.** Перед публикацией вывод сохраняется по `request_id`. Повтор того же запроса не подписывается заново — публикуется сохранённый BOC. Тот же `request_id` с другой суммой, адресом или пользователем уходит в DLQ. Seqno выдаётся как `MAX(seqno) + 1` из БД под мьютексом вместе с подписью и записью: если подпись или запись не удались, seqno не расходуется.
- **Отправка.** `POST /api/v2/sendBocReturnHash`. Вывод в статусе `sent`/`confirmed`/`failed` повторно не отправляется; другой BOC для того же `request_id` не отправляется никогда (DLQ). Повторная отправка того же BOC безопасна: кошелёк примет seqno один раз. Сетевые ошибки, 429 и 5xx — повтор, 400 — DLQ. Очередь `withdrawals.signed` читается одним воркером: seqno должны идти по порядку.
- **Подтверждение.** Каждые `CONFIRM_POLL_INTERVAL` опрос делает **один** запрос последних `CONFIRM_SCAN_LIMIT` транзакций горячего кошелька (`TON_WALLET_ADDRESS`) и сверяет их с хэшами сообщений свежих выводов — расход лимита toncenter не зависит от числа ожидающих выводов. Нашлась и успешна — `confirmed`; прервана — `failed`. Выводы старше `CONFIRM_TIMEOUT` не объявляются `failed` (BOC ещё может попасть в блок, и ядро вернуло бы деньги за прошедший вывод): они проверяются отдельно, редко и по кругу через `transactionsByMessage`, не мешая свежим, а в лог пишется ошибка для ручного разбора.
- **Схема** применяется при каждом старте; повторное создание индексов пропускается, поэтому новые индексы можно просто дописывать в `schema.sql`.
- **Ключ toncenter** — `TONCENTER_API_KEY`, пока пустой (публичный лимит ~1 запрос/с, `TONCENTER_RPS=1`). С ключом лимит можно поднять.
## Watcher (депозиты)

Схема: **один кошелёк депозитов** (`TON_DEPOSIT_ADDRESS`), пользователь указывает в комментарии к переводу свой код. Пока поддерживается только TON, без жетонов.

- Каждые `WATCHER_POLL_INTERVAL` читает `GET /api/v3/transactions?account=…&start_lt=…&sort=asc` пачками по `WATCHER_BATCH_SIZE`; если пачка полная, сразу запрашивает следующую.
- Депозит — транзакция с внутренним входящим сообщением (есть отправитель), не bounced, с ненулевой суммой и не прерванная. Собственные выводы (внешние сообщения) и возвраты пропускаются.
- `DEPOSIT_DETECTED`: `tx_hash`, `lt`, `from_address`, `to_address`, `amount` ("50.5"), `amount_nano`, `asset`, `comment`, `tx_time`, `detected_at`. `message_id` — UUIDv5 от `tx_hash`.
- Курсор (`lt`) хранится в таблице `watcher_cursors` и двигается только после подтверждённой брокером публикации. После рестарта watcher продолжает с того же места; при сбое событие может прийти повторно с тем же `message_id` — **ядро обязано дедуплицировать по `message_id`/`tx_hash`**.
- Кому зачислить, решает ядро по `comment`. Перевод без комментария или с неизвестным кодом ядро должно отправлять на ручной разбор.
- Запускать строго один watcher на кошелёк.

- Ядру, которому нужны результаты, достаточно своей очереди, привязанной к `core.events` с ключом `withdrawals.result`: direct-exchange отдаст копию каждой очереди.

## Контракт сообщений

- Тело — JSON, `content_type: application/json`, `delivery_mode: 2` (persistent).
- У каждого сообщения заголовок `message_id` (UUID) — ключ идемпотентности. Он же дублируется в AMQP-свойство `message_id`; `type` = имя события, `correlation_id` = `request_id` / `tx_hash`.
- Суммы — десятичные строки (`"50.0"`), до 9 знаков после точки; float не используется.
- `WITHDRAW_REQUESTED`: `request_id` (UUID), `user_id` (> 0), `amount`, `asset` (пока только `TON`), `to_address` (raw `0:<hex>` или user-friendly с проверкой CRC).
- `WITHDRAW_SIGNED`: `request_id`, `boc`, `seqno`.
- `WITHDRAW_RESULT`: `request_id`, `status` (`sent` | `confirmed` | `failed`), `tx_hash` (обязателен для `confirmed`), `seqno`, `error`.
- `DEPOSIT_DETECTED`: `tx_hash`, `lt`, `from_address`, `to_address`, `amount`, `asset`, `comment`, `detected_at`.

Исходящие `message_id` детерминированы (UUIDv5 от `request_id` / `tx_hash`): повторная публикация того же события приходит с тем же `message_id`, и получатель отбрасывает дубль. **Broadcaster обязан дедуплицировать по `message_id`/`request_id`** — это последняя линия защиты от двойного вывода.

## Топология

Объявляется после каждого (пере)подключения, все очереди durable, по умолчанию quorum:

- exchange `core.events` (direct); каждая очередь привязана к нему с routing key = имя очереди;
- для каждой очереди `X` — `X.dlq`; у `X` заданы `x-dead-letter-exchange: ""` и `x-dead-letter-routing-key: X.dlq`;
- для потребляемых очередей — delay-очереди `X.retry.5s`, `X.retry.10s`, `X.retry.20s` (`RETRY_BASE_DELAY` × 2ⁿ) с `x-message-ttl`; по истечении TTL сообщение возвращается в `X`.

Для quorum-очередей включён `x-dead-letter-strategy: at-least-once`: при at-most-once (по умолчанию) сообщение может потеряться по пути в DLQ.

Если очереди уже объявлены с другими аргументами (например, classic вместо quorum), RabbitMQ ответит `PRECONDITION_FAILED` — сервис будет писать ошибку и переподключаться. Нужно удалить очереди или выставить `AMQP_QUEUE_TYPE` под существующие.

## Надёжность

- **Соединение.** Одно на процесс, под мьютексом. `handleReconnect` слушает `NotifyClose`, переподключается с задержкой 1s → 2s → … → 30s и заново объявляет топологию. Каналы publish и consume раздельные и пересоздаются сами.
- **Publisher confirms.** `Confirm(false)` + `NotifyPublish`; публикация mandatory и ждёт ack. Nack, `basic.return` (некуда доставить) или таймаут `PUBLISH_TIMEOUT` возвращают ошибку.
- **Consumer.** `Qos(PREFETCH_COUNT)`, только ручной ack после успешной обработки, пул из `CONSUMER_WORKERS` воркеров.
- **Ошибки.** Постоянные (невалидные данные) → `Nack(false, false)` → DLQ. Временные (сеть, таймаут, nack брокера) → копия в delay-очередь с `x-retry-count` + 1 и ack исходного; после `MAX_RETRIES` → DLQ. Если не удалось даже поставить повтор, сообщение возвращается в очередь (`requeue`), а не теряется. Неизвестные ошибки считаются постоянными: деньги безопаснее разобрать вручную.
- **Идемпотентность.** `message_id` проверяется до обработки и помечается после успеха (до ack). Параллельная обработка двух копий одного сообщения заблокирована. Хранилище — таблица `processed_messages` в MySQL (TTL 24 ч, общая для реплик).
- **Graceful shutdown.** SIGINT/SIGTERM → `ch.Cancel(tag, false)` → ожидание in-flight (`sync.WaitGroup`) до `SHUTDOWN_TIMEOUT` → закрытие каналов и соединения. Если таймаут истёк, обработчики прерываются, а их сообщения возвращаются в очередь.

### Seqno и масштабирование

Seqno кошелька выдаётся последовательно под мьютексом внутри процесса. Несколько consumer-реплик с **одним** горячим кошельком будут конфликтовать по seqno — нужен один consumer, распределённая блокировка или кошелёк на реплику. Broadcaster — тоже один экземпляр на кошелёк. Watcher — строго один на кошелёк.

Настоящему подписанту стоит сверять seqno из БД с get-методом кошелька в сети.

## HTTP (`METRICS_PORT`, по умолчанию 9090)

- `/metrics` — Prometheus: `chain_publish_total{queue,status}`, `chain_consume_total{queue,status}`, `chain_retry_total{queue}`, `chain_dlq_total{queue}`, `chain_connection_up`, а также `chain_reconnect_total`, `chain_handler_duration_seconds`, `chain_publish_duration_seconds`, `chain_withdraw_result_total{status}`.
- `/healthz` — liveness (процесс жив).
- `/readyz` — readiness (есть соединение с RabbitMQ). Его же использует `HEALTHCHECK` в Dockerfile через `chain-service healthcheck`.

## Переменные окружения

Полный список со значениями по умолчанию — в [`.env.example`](.env.example). Обязательны `RABBITMQ_URL`, `MYSQL_DSN`, `TON_WALLET_ADDRESS` и `TON_DEPOSIT_ADDRESS` (при `TON_CLIENT=toncenter`) и `ALLOW_STUB_SIGNER=true` (для consumer, пока нет настоящей подписи).

## Структура

```
cmd/chain-service/main.go      запуск, режимы, graceful shutdown, healthcheck
internal/config/               env → Config с валидацией
internal/amqp/client.go        соединение, переподключение, топология, declareQueueWithDLQ
internal/amqp/publisher.go     publisher confirms + NotifyReturn
internal/amqp/consumer.go      QoS, воркеры, ack/nack, повторы, DLQ, shutdown
internal/amqp/errors.go        классификация ошибок (Permanent / Transient)
internal/store/                MySQL: схема, идемпотентность, история выводов, курсор watcher
internal/ton/                  клиент toncenter (отправка, подтверждения, депозиты) и заглушка
internal/handler/              подпись, broadcaster, подтверждения, депозиты, валидация TON
internal/metrics/              Prometheus и HTTP-сервер
```
