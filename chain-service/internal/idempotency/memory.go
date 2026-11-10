// Package idempotency — хранилища уже обработанных message_id.
package idempotency

import (
	"context"
	"sync"
	"time"
)

// MemoryStore — in-memory реализация amqp.IdempotencyStore для MVP:
// sync.Map с TTL и периодической очисткой.
//
// Ограничения: состояние теряется при рестарте и не разделяется между
// репликами. Для продакшена с несколькими экземплярами нужна общая
// реализация (Redis SET NX EX или уникальный ключ в Postgres) — интерфейс
// тот же, меняется только конструктор в main.
type MemoryStore struct {
	ttl   time.Duration
	items sync.Map // message_id → int64 (UnixNano истечения)
	now   func() time.Time
}

// NewMemoryStore создаёт хранилище с заданным TTL записи.
func NewMemoryStore(ttl time.Duration) *MemoryStore {
	return &MemoryStore{ttl: ttl, now: time.Now}
}

// Seen сообщает, обрабатывался ли messageID в пределах TTL.
func (s *MemoryStore) Seen(messageID string) bool {
	v, ok := s.items.Load(messageID)
	if !ok {
		return false
	}
	if s.now().UnixNano() >= v.(int64) {
		s.items.CompareAndDelete(messageID, v)
		return false
	}
	return true
}

// Mark запоминает messageID как обработанный на TTL.
func (s *MemoryStore) Mark(messageID string) {
	s.items.Store(messageID, s.now().Add(s.ttl).UnixNano())
}

// Cleanup удаляет просроченные записи и возвращает их число.
func (s *MemoryStore) Cleanup() int {
	now := s.now().UnixNano()
	removed := 0
	s.items.Range(func(k, v any) bool {
		if now >= v.(int64) && s.items.CompareAndDelete(k, v) {
			removed++
		}
		return true
	})
	return removed
}

// Len — число записей (включая ещё не вычищенные просроченные).
func (s *MemoryStore) Len() int {
	n := 0
	s.items.Range(func(_, _ any) bool { n++; return true })
	return n
}

// Run периодически чистит просроченные записи до отмены ctx.
func (s *MemoryStore) Run(ctx context.Context, interval time.Duration, onCleanup func(removed, left int)) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			removed := s.Cleanup()
			if onCleanup != nil {
				onCleanup(removed, s.Len())
			}
		}
	}
}
