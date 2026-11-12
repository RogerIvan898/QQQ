// Package ton — доступ к сети TON для broadcaster: отправка подписанных
// внешних сообщений (BOC) и поиск транзакции по хэшу сообщения.
package ton

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"
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
// Ошибки сети, таймауты, 429 и 5xx возвращаются как failure.Transient,
// ошибки данных (400 — битый BOC) — как failure.Permanent.
type Client interface {
	// SendBoc отправляет BOC (base64) и возвращает хэш внешнего сообщения,
	// по которому затем ищется транзакция.
	SendBoc(ctx context.Context, boc string) (msgHash string, err error)
	// FindTransaction ищет транзакцию по хэшу сообщения; nil — ещё нет.
	FindTransaction(ctx context.Context, msgHash string) (*Tx, error)
}

// Network — клиент для broadcaster, опроса подтверждений и watcher.
type Network interface {
	Client
	// FindTransactions ищет транзакции по хэшам сообщений среди последних
	// limit транзакций кошелька account одним запросом.
	FindTransactions(ctx context.Context, account string, msgHashes []string, limit int) (map[string]*Tx, error)
	// DepositsSince читает транзакции кошелька account с lt > afterLT.
	DepositsSince(ctx context.Context, account string, afterLT uint64, limit int) (DepositBatch, error)
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

// DepositsSince у заглушки ничего не находит и не двигает курсор.
func (Stub) DepositsSince(_ context.Context, _ string, afterLT uint64, _ int) (DepositBatch, error) {
	return DepositBatch{NextLT: afterLT}, nil
}

// FindTransactions у заглушки «подтверждает» все запрошенные сообщения.
func (s Stub) FindTransactions(ctx context.Context, _ string, msgHashes []string, _ int) (map[string]*Tx, error) {
	out := make(map[string]*Tx, len(msgHashes))
	for _, h := range msgHashes {
		out[h], _ = s.FindTransaction(ctx, h)
	}
	return out, nil
}

// MessageHash считает хэш внешнего сообщения из его BOC (base64) — хэш
// корневой ячейки. Именно он стоит в in_msg.hash транзакции кошелька, так
// что вывод можно найти в сети, не полагаясь на ответ sendBoc.
func MessageHash(boc string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(boc)
	if err != nil {
		return "", fmt.Errorf("boc is not valid base64: %w", err)
	}
	root, err := cell.FromBOC(raw)
	if err != nil {
		return "", fmt.Errorf("boc is not a valid bag of cells: %w", err)
	}
	return base64.StdEncoding.EncodeToString(root.Hash()), nil
}
