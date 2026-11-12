package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"go.uber.org/zap"
)

// cleanupTimeout — таймаут удаления одной пачки просроченных ключей.
const cleanupTimeout = 30 * time.Second

// Idempotency — amqp.IdempotencyStore поверх PostgreSQL: общий для всех
// реплик и переживает рестарт.
//
// Интерфейс не возвращает ошибок, поэтому при недоступной БД Seen
// отвечает false (сообщение будет обработано). Это безопасно: от повторной
// подписи и отправки защищает таблица withdrawals по request_id.
type Idempotency struct {
	db  *sql.DB
	ttl time.Duration
	log *zap.Logger
}

// NewIdempotency создаёт хранилище с заданным TTL записи.
func NewIdempotency(db *sql.DB, ttl time.Duration, log *zap.Logger) *Idempotency {
	return &Idempotency{db: db, ttl: ttl, log: log.Named("idempotency")}
}

// Seen сообщает, обрабатывался ли messageID в пределах TTL.
func (s *Idempotency) Seen(messageID string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), queryTimeout)
	defer cancel()
	var one int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM processed_messages WHERE message_id = $1 AND expires_at > now()`,
		messageID).Scan(&one)
	switch {
	case err == nil:
		return true
	case errors.Is(err, sql.ErrNoRows):
		return false
	default:
		s.log.Error("idempotency check failed, processing anyway", zap.String("message_id", messageID), zap.Error(err))
		return false
	}
}

// Mark запоминает messageID на TTL.
func (s *Idempotency) Mark(messageID string) {
	ctx, cancel := context.WithTimeout(context.Background(), queryTimeout)
	defer cancel()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO processed_messages (message_id, expires_at) VALUES ($1, $2)
		 ON CONFLICT (message_id) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
		messageID, time.Now().UTC().Add(s.ttl))
	if err != nil {
		s.log.Error("idempotency mark failed", zap.String("message_id", messageID), zap.Error(err))
	}
}

// Run периодически удаляет просроченные ключи пачками.
func (s *Idempotency) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.log.Debug("idempotency cleanup", zap.Int64("removed", s.cleanup(ctx)))
		}
	}
}

// cleanup удаляет просроченные ключи пачками, пока удаляются полные пачки:
// одной пачки за интервал не хватило бы при большом потоке, а один
// огромный DELETE надолго держал бы блокировки. В PostgreSQL у DELETE нет
// LIMIT, поэтому пачка выбирается подзапросом по первичному ключу.
func (s *Idempotency) cleanup(ctx context.Context) int64 {
	const batch = 10000
	var total int64
	for ctx.Err() == nil {
		qctx, cancel := context.WithTimeout(ctx, cleanupTimeout)
		res, err := s.db.ExecContext(qctx,
			`DELETE FROM processed_messages WHERE message_id IN (
			   SELECT message_id FROM processed_messages WHERE expires_at <= now() LIMIT $1)`, batch)
		cancel()
		if err != nil {
			if ctx.Err() == nil {
				s.log.Warn("idempotency cleanup failed", zap.Error(err))
			}
			return total
		}
		n, _ := res.RowsAffected()
		total += n
		if n < batch {
			return total
		}
	}
	return total
}
