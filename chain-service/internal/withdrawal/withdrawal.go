// Package withdrawal — выводы: отправка подписанных транзакций в сеть TON,
// отслеживание подтверждений и публикация результата.
//
// Жизненный цикл вывода: signed → sent → confirmed | failed.
package withdrawal

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"time"
)

// Status — состояние вывода в хранилище.
type Status string

// Состояния вывода.
const (
	StatusSigned    Status = "signed"    // подписан, ещё не отправлен в сеть
	StatusSent      Status = "sent"      // принят нодой, ждём включения в блок
	StatusConfirmed Status = "confirmed" // транзакция в блоке
	StatusFailed    Status = "failed"    // окончательно не прошёл
)

// Withdrawal — вывод, одна запись на request_id.
type Withdrawal struct {
	RequestID  string
	UserID     int64 // 0 — неизвестен
	AmountNano uint64
	Asset      string
	ToAddress  string
	Seqno      uint32
	BOC        string
	BOCHash    string
	Status     Status
	MsgHash    string
	TxHash     string
	Error      string
	SentAt     time.Time // нулевое значение — не отправлялся
}

// BOCHash — sha256 от строки BOC в hex: защита от подмены BOC для того же
// request_id.
func BOCHash(boc string) string {
	sum := sha256.Sum256([]byte(boc))
	return hex.EncodeToString(sum[:])
}

// Repository — хранилище выводов (реализация — store.Withdrawals).
//
// Переходы состояний делает само хранилище и только из допустимых
// состояний: например, MarkConfirmed не тронет уже failed-вывод.
type Repository interface {
	Get(ctx context.Context, requestID string) (*Withdrawal, error)
	// InsertSigned создаёт запись в состоянии signed; false — уже есть.
	InsertSigned(ctx context.Context, w Withdrawal) (bool, error)
	MarkSent(ctx context.Context, requestID, msgHash string) error
	MarkConfirmed(ctx context.Context, requestID, txHash string) error
	MarkFailed(ctx context.Context, requestID, txHash, reason string) error
	// ListSent — отправленные после sentAfter (ждут подтверждения).
	ListSent(ctx context.Context, sentAfter time.Time, limit int) ([]Withdrawal, error)
	// ListStale — отправленные не позже sentBefore, по возрастанию request_id
	// начиная после afterID (обход зависших по кругу).
	ListStale(ctx context.Context, sentBefore time.Time, afterID string, limit int) ([]Withdrawal, error)
}
