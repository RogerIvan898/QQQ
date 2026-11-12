# chain-service

Go-сервис между сервисом подписи, ядром покер-рума и сетью TON. Подписи здесь **нет**: ключи кошелька есть только у отдельного сервиса подписи. chain-service принимает от него готовые подписанные транзакции, отправляет их в блокчейн, следит за подтверждением и находит входящие депозиты.

```
сервис подписи ──► withdrawals.signed ──► [broadcaster] ──► toncenter ──► TON
                                              │  └ опрос подтверждений
ядро / сервис подписи ◄── withdrawals.result ◄┘   (sent → confirmed | failed)

ядро ◄── deposits ◄── [watcher] ◄── транзакции кошелька депозитов (toncenter)
```

| Очередь | Направление | Событие | Кто пишет → кто читает |
|---|---|---|---|
| `withdrawals.signed` | вход | `WITHDRAW_SIGNED` | сервис подписи → chain-service |
| `withdrawals.result` | выход | `WITHDRAW_RESULT` | chain-service → ядро, сервис подписи |
| `deposits` | выход | `DEPOSIT_DETECTED` | chain-service → ядро |

Оба компонента (broadcaster и watcher) работают в одном процессе. Необязательная переменная `MODE` (`broadcaster` | `watcher`, по умолчанию `all`) позволяет запустить только один из них.

## Запуск

```bash
docker compose up --build
```

RabbitMQ UI — http://localhost:15672 (`chain` / `chain`), метрики — http://localhost:9090/metrics. В compose стоит `TON_CLIENT=stub`: сеть не трогается, «отправка» и «подтверждение» успешны сразу.

Локально (Go ≥ 1.26, RabbitMQ и PostgreSQL 14+):

```bash
cp .env.example .env
set -a && . ./.env && set +a
go run ./cmd/chain-service
```

Проверки:

```bash
go build ./... && go vet ./... && go test ./...
```

Тест вручную: в UI RabbitMQ *Exchanges → core.events → Publish message*, routing key `withdrawals.signed`, header `message_id` = любой UUID, `content_type` = `application/json`, тело `{ "request_id": "<uuid>", "boc": "<base64>", "seqno": 1 }`. В логах появятся результаты `sent`, затем `confirmed`.

## Контракт сообщений

- Тело — JSON, `content_type: application/json`, `delivery_mode: 2` (persistent).
- У каждого сообщения заголовок `message_id` (UUID) — ключ идемпотентности; он же в AMQP-свойстве `message_id`. `type` = имя события, `correlation_id` = `request_id` / `tx_hash`.
- `WITHDRAW_SIGNED` (от сервиса подписи): `request_id` (UUID), `boc` (base64 внешнего сообщения кошелька), `seqno`.
- `WITHDRAW_RESULT`: `request_id`, `status` (`sent` | `confirmed` | `failed`), `tx_hash`, `seqno`, `error`.
- `DEPOSIT_DETECTED`: `tx_hash`, `lt`, `from_address`, `to_address`, `amount` (`"50.5"`), `amount_nano`, `asset`, `comment`, `tx_time`, `detected_at`.

У каждого исходящего сообщения AMQP-свойство `user_id` = пользователь RabbitMQ, под которым работает chain-service. RabbitMQ отклоняет публикацию, если оно не совпадает с пользователем соединения, поэтому подделать его нельзя. **Ядро обязано принимать `DEPOSIT_DETECTED` и `WITHDRAW_RESULT` только с `user_id` chain-service** — иначе любой, кто может писать в exchange, сможет «зачислить» депозит или вызвать возврат денег. Каждому сервису — свой пользователь RabbitMQ с правами только на свои очереди.

Входящее сообщение больше `MAX_MESSAGE_BYTES` (64 КБ) сразу уходит в DLQ без разбора.

Исходящие `message_id` детерминированы (UUIDv5 от `request_id` + статус / `tx_hash`): повторная публикация того же события приходит с тем же `message_id`, получатель обязан отбросить дубль.

### Что должен обеспечить сервис подписи

- Выдавать seqno строго по порядку и не подписывать один `request_id` дважды с разными данными.
- Ставить `valid_until` меньше `CONFIRM_TIMEOUT`.
- Слушать `withdrawals.result`: вывод, застрявший в `sent` (транзакция так и не попала в блок, например истёк `valid_until`), требует решения — переподписать с тем же seqno или вернуть деньги.

## Отправка выводов (broadcaster)

- Читает `withdrawals.signed` **строго по одному** (prefetch 1, один воркер): кошелёк принимает seqno только по порядку. Временные ошибки (сеть, 429/5xx toncenter, PostgreSQL, брокер) повторяются **на месте** с паузой 1s → 30s, пока не пройдут: сообщение не уходит в delay-очередь, и следующий seqno не обгоняет текущий. Прервать ожидание может только остановка сервиса — тогда сообщение возвращается в очередь.
- Каждый вывод сохраняется в PostgreSQL (`withdrawals`, одна строка на `request_id`: seqno, BOC, его sha256, статус `signed → sent → confirmed | failed`).
- **Двойной отправки нет:** вывод в статусе `sent`/`confirmed`/`failed` повторно не отправляется; другой BOC для того же `request_id` не отправляется никогда (DLQ на разбор). Повторная отправка того же BOC безопасна — кошелёк примет seqno один раз.
- Хэш сообщения считается из BOC и сохраняется **до** отправки. Отправка — `POST /api/v2/sendBocReturnHash`; 400 (битый BOC) — DLQ. Если отправка отклонена, сервис сначала ищет сообщение в сети по хэшу: если процесс упал между отправкой и записью `sent`, кошелёк уже принял этот seqno, и вывод считается отправленным. После отправки публикуется `sent`.
- **Подтверждение.** Каждые `CONFIRM_POLL_INTERVAL` — **один** запрос последних `CONFIRM_SCAN_LIMIT` транзакций горячего кошелька (`TON_WALLET_ADDRESS`) и сверка с хэшами сообщений свежих выводов: расход лимита toncenter не зависит от числа ожидающих выводов. Нашлась и успешна — `confirmed`; прервана — `failed`.
- Выводы старше `CONFIRM_TIMEOUT` **не** объявляются `failed` (BOC ещё может попасть в блок, и ядро вернуло бы деньги за прошедший вывод): они проверяются редко и по кругу через `transactionsByMessage`, не мешая свежим, а в лог пишется ошибка для ручного разбора.

## Депозиты (watcher)

Схема: **один кошелёк депозитов** (`TON_DEPOSIT_ADDRESS`), пользователь указывает в комментарии к переводу свой код. Только TON, без жетонов.

- Каждые `WATCHER_POLL_INTERVAL` читает `GET /api/v3/transactions?account=…&start_lt=…&sort=asc` пачками по `WATCHER_BATCH_SIZE`; полная пачка — сразу следующая.
- Депозит — входящее внутреннее сообщение (есть отправитель), не bounced, с ненулевой суммой, транзакция не прервана.
- Позиция (`lt`) хранится в `watcher_cursors` и двигается только после подтверждённой брокером публикации; после рестарта watcher продолжает с того же места.
- Кому зачислить, решает ядро по `comment`; перевод без кода или с неизвестным кодом — на ручной разбор. **Ядро обязано дедуплицировать по `message_id`/`tx_hash`.**
- Строго один watcher на кошелёк.

## Надёжность

- **Соединение.** Одно на процесс, под мьютексом; переподключение 1s → 2s → … → 30s с восстановлением топологии. Каналы publish и consume раздельные.
- **Топология.** Exchange `core.events`; для каждой очереди `X` — `X.dlq` (`x-dead-letter-routing-key`); для `withdrawals.signed` — delay-очереди `withdrawals.signed.retry.5s/10s/20s`. По умолчанию quorum-очереди с at-least-once dead-lettering.
- **Publisher confirms** с mandatory: nack, возврат или таймаут — ошибка.
- **Consumer.** Только ручной ack. Постоянные ошибки → DLQ; временные → повтор с `x-retry-count`, после `MAX_RETRIES` → DLQ; если не удалось поставить повтор — возврат в очередь. Неизвестные ошибки считаются постоянными.
- **Идемпотентность.** `message_id` в `processed_messages` (PostgreSQL, TTL 24 ч, общая для реплик).
- **Graceful shutdown.** SIGINT/SIGTERM → отмена подписки → ожидание текущих сообщений до `SHUTDOWN_TIMEOUT` → закрытие каналов и соединения.
- **Схема БД** применяется при старте (`CREATE … IF NOT EXISTS`), повторный запуск безопасен.

## HTTP (`METRICS_PORT`, по умолчанию 9090)

- `/metrics` — `chain_publish_total{queue,status}`, `chain_consume_total{queue,status}`, `chain_retry_total{queue}`, `chain_dlq_total{queue}`, `chain_connection_up`, `chain_reconnect_total`, `chain_handler_duration_seconds`, `chain_publish_duration_seconds`.
- `/healthz` — liveness; `/readyz` — есть соединение с RabbitMQ (используется `HEALTHCHECK` в Dockerfile).
- Эндпоинты без авторизации: вне Docker привяжите их к внутреннему интерфейсу через `METRICS_HOST`.

## Безопасность

- Ключей кошелька в сервисе нет: отправляются только транзакции, уже подписанные сервисом подписи.
- Подлинность исходящих событий — через `user_id` (см. «Контракт сообщений»).
- toncenter — только по https; это единственный источник данных о депозитах, для крупных сумм в будущем стоит сверять со вторым источником (lite-сервер с доказательствами).
- Сборка на Go 1.27.3 (`toolchain` в `go.mod`, тег образа в Dockerfile); проверка зависимостей: `go run golang.org/x/vuln/cmd/govulncheck@latest ./...`.
- Учётки и открытые порты в `docker-compose.yml` — только для локальной разработки.

## Переменные окружения

Все переменные с пояснениями и значениями по умолчанию — в [`.env.example`](.env.example). Обязательны `RABBITMQ_URL`, `POSTGRES_DSN`, а при `TON_CLIENT=toncenter` — `TON_WALLET_ADDRESS` и `TON_DEPOSIT_ADDRESS`.

## Структура

```
cmd/chain-service/main.go      запуск, graceful shutdown, healthcheck
internal/config/               env → Config с валидацией
internal/amqp/                 соединение и переподключение, топология, publisher confirms, consumer
internal/store/                PostgreSQL: схема, идемпотентность, история выводов, курсор watcher
internal/ton/                  клиент toncenter (отправка, подтверждения, депозиты) и заглушка
internal/handler/              broadcaster, опрос подтверждений, watcher
internal/metrics/              Prometheus и HTTP-сервер
```
