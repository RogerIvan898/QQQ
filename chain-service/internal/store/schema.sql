-- Схема chain-service. Применяется при старте (CREATE TABLE IF NOT EXISTS),
-- поэтому изменения существующих таблиц делаются отдельными миграциями.

-- Ключи идемпотентности консьюмеров (заголовок message_id).
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id CHAR(36)    NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    PRIMARY KEY (message_id),
    KEY idx_processed_expires (expires_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

-- История выводов: одна строка на request_id.
-- signed → sent → confirmed | failed
CREATE TABLE IF NOT EXISTS withdrawals (
    request_id  CHAR(36)        NOT NULL,
    user_id     BIGINT          NULL,      -- NULL, если строку создал broadcaster
    amount_nano BIGINT UNSIGNED NULL,
    asset       VARCHAR(16)     NULL,
    to_address  VARCHAR(128)    NULL,
    seqno       INT UNSIGNED    NOT NULL,
    boc         MEDIUMTEXT      NOT NULL,
    boc_hash    CHAR(64)        NOT NULL,  -- sha256(boc) hex: защита от подмены BOC
    status      VARCHAR(16)     NOT NULL,
    msg_hash    VARCHAR(128)    NULL,      -- хэш внешнего сообщения от toncenter
    tx_hash     VARCHAR(128)    NULL,
    error       TEXT            NULL,
    created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    sent_at     DATETIME(3)     NULL,
    PRIMARY KEY (request_id),
    KEY idx_withdrawals_status_sent (status, sent_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;
