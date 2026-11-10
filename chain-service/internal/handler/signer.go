package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"sync"
	"time"

	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
)

// SignRequest — данные для подписи исходящего перевода.
type SignRequest struct {
	RequestID  string
	ToAddress  string
	AmountNano uint64
	Asset      string
}

// SignedTx — подписанное внешнее сообщение для Broadcaster.
type SignedTx struct {
	BOC   string // base64 BoC
	Seqno uint32 // seqno кошелька, на котором подписано сообщение
}

// Signer подписывает переводы с горячего кошелька.
//
// Реализация обязана сериализовать выдачу seqno: два сообщения с одним
// seqno — это одна успешная транзакция и одна отклонённая. Сетевые ошибки
// (недоступна нода, таймаут получения seqno) нужно возвращать как
// amqp.Transient, ошибки данных — как amqp.Permanent.
type Signer interface {
	Sign(ctx context.Context, req SignRequest) (SignedTx, error)
}

// StubSigner — ЗАГЛУШКА для разработки: никаких ключей и реальной подписи.
// BOC содержит base64 от JSON с параметрами перевода, seqno — локальный
// счётчик. Запуск с ней требует явного ALLOW_STUB_SIGNER=true.
//
// Продакшен-реализация: tonutils-go (wallet.V4R2/V5R1), ключ из KMS/Vault,
// seqno — get-метод seqno кошелька плюс локальная очередь неподтверждённых.
type StubSigner struct {
	mu    sync.Mutex
	seqno uint32
}

// NewStubSigner создаёт заглушку и громко предупреждает в логах.
func NewStubSigner(log *zap.Logger) *StubSigner {
	log.Warn("STUB signer is active: withdrawals are NOT really signed, do not use in production")
	return &StubSigner{seqno: 1}
}

// Sign выдаёт фиктивную «подпись» с монотонным seqno.
func (s *StubSigner) Sign(ctx context.Context, req SignRequest) (SignedTx, error) {
	if err := ctx.Err(); err != nil {
		return SignedTx{}, amqp.Transient(err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	seqno := s.seqno
	payload, err := json.Marshal(struct {
		Stub       bool   `json:"stub"`
		RequestID  string `json:"request_id"`
		ToAddress  string `json:"to_address"`
		AmountNano uint64 `json:"amount_nano"`
		Asset      string `json:"asset"`
		Seqno      uint32 `json:"seqno"`
		SignedAt   int64  `json:"signed_at"`
	}{true, req.RequestID, req.ToAddress, req.AmountNano, req.Asset, seqno, time.Now().Unix()})
	if err != nil {
		return SignedTx{}, amqp.Permanent(err)
	}
	s.seqno++
	return SignedTx{BOC: base64.StdEncoding.EncodeToString(payload), Seqno: seqno}, nil
}
