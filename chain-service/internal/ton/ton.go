// Package ton — доступ к сети TON для broadcaster: отправка подписанных
// внешних сообщений (BOC) и поиск транзакции по хэшу сообщения.
package ton

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
)

// Tx — транзакция кошелька, порождённая нашим внешним сообщением.
type Tx struct {
	Hash    string
	LT      string
	Success bool   // false — транзакция прервана (aborted / ошибка compute)
	Reason  string // причина неуспеха
}

// Client — то, что нужно broadcaster от сети.
//
// Ошибки сети, таймауты, 429 и 5xx возвращаются как amqp.Transient,
// ошибки данных (400 — битый BOC) — как amqp.Permanent.
type Client interface {
	// SendBoc отправляет BOC (base64) и возвращает хэш внешнего сообщения,
	// по которому затем ищется транзакция.
	SendBoc(ctx context.Context, boc string) (msgHash string, err error)
	// FindTransaction ищет транзакцию по хэшу сообщения; nil — ещё нет.
	FindTransaction(ctx context.Context, msgHash string) (*Tx, error)
}

// Stub — ЗАГЛУШКА для локальной разработки: «отправка» всегда успешна,
// транзакция «находится» сразу. Нужна, пока подписант — тоже заглушка
// (его BOC настоящая сеть всё равно отвергнет).
type Stub struct{}

// SendBoc возвращает sha256 от BOC как хэш сообщения.
func (Stub) SendBoc(_ context.Context, boc string) (string, error) {
	sum := sha256.Sum256([]byte(boc))
	return base64.StdEncoding.EncodeToString(sum[:]), nil
}

// FindTransaction сразу «подтверждает» транзакцию.
func (Stub) FindTransaction(_ context.Context, msgHash string) (*Tx, error) {
	sum := sha256.Sum256([]byte("tx:" + msgHash))
	return &Tx{Hash: base64.StdEncoding.EncodeToString(sum[:]), LT: "0", Success: true}, nil
}
