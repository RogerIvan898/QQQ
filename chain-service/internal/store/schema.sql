-- Схема chain-service (PostgreSQL). Применяется при старте (IF NOT EXISTS),
-- поэтому изменения существующих таблиц делаются отдельными миграциями.

-- Ключи идемпотентности консьюмеров (заголовок message_id).
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id CHAR(36)       NOT NULL PRIMARY KEY,
    expires_at TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_processed_expires ON processed_messages (expires_at);

-- История выводов: одна строка на request_id.
-- signed → sent → confirmed | failed
CREATE TABLE IF NOT EXISTS withdrawals (
    request_id  CHAR(36)       NOT NULL PRIMARY KEY,
    user_id     BIGINT         NULL,      -- не используется: подпись в другом сервисе
    amount_nano BIGINT         NULL CHECK (amount_nano >= 0),
    asset       VARCHAR(16)    NULL,
    to_address  VARCHAR(128)   NULL,
    seqno       BIGINT         NOT NULL CHECK (seqno >= 0),
    boc         TEXT           NOT NULL,
    boc_hash    CHAR(64)       NOT NULL,  -- sha256(boc) hex: защита от подмены BOC
    status      VARCHAR(16)    NOT NULL,
    msg_hash    VARCHAR(128)   NULL,      -- хэш внешнего сообщения
    tx_hash     VARCHAR(128)   NULL,
    error       TEXT           NULL,
    created_at  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    sent_at     TIMESTAMPTZ(3) NULL
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status_sent ON withdrawals (status, sent_at);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status_request ON withdrawals (status, request_id);

-- Курсор наблюдателя депозитов: последний обработанный lt по адресу кошелька.
CREATE TABLE IF NOT EXISTS watcher_cursors (
    account    VARCHAR(128)   NOT NULL PRIMARY KEY,
    last_lt    BIGINT         NOT NULL CHECK (last_lt >= 0),
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
