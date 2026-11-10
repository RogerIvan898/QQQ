package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	amqp091 "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
	"gitlab.com/company-group7340831/poker/chain-service/internal/metrics"
	"gitlab.com/company-group7340831/poker/chain-service/internal/store"
)

// AssetTON — единственный поддерживаемый в MVP актив.
const AssetTON = "TON"

// WithdrawRequested — входящий запрос на вывод (очередь withdrawals).
type WithdrawRequested struct {
	RequestID string `json:"request_id"`
	UserID    int64  `json:"user_id"`
	Amount    string `json:"amount"` // десятичная строка, никаких float
	Asset     string `json:"asset"`
	ToAddress string `json:"to_address"`
}

// Validate проверяет запрос и возвращает сумму в nanoton.
func (r *WithdrawRequested) Validate() (uint64, error) {
	var errs []error
	if !validUUID(r.RequestID) {
		errs = append(errs, fmt.Errorf("request_id %q is not a UUID", r.RequestID))
	}
	if r.UserID <= 0 {
		errs = append(errs, fmt.Errorf("user_id must be positive, got %d", r.UserID))
	}
	if r.Asset != AssetTON {
		errs = append(errs, fmt.Errorf("asset %q is not supported", r.Asset))
	}
	if err := ValidateTONAddress(r.ToAddress); err != nil {
		errs = append(errs, err)
	}
	amount, err := ParseAmount(r.Amount, tonDecimals)
	if err != nil {
		errs = append(errs, err)
	}
	return amount, errors.Join(errs...)
}

// WithdrawSigned — подписанная транзакция для Broadcaster (withdrawals.signed).
type WithdrawSigned struct {
	RequestID string `json:"request_id"`
	BOC       string `json:"boc"`
	Seqno     uint32 `json:"seqno"`
}

// WithdrawalHandler: withdrawals → подпись → withdrawals.signed.
type WithdrawalHandler struct {
	pub    Publisher
	signer Signer
	repo   WithdrawalRepo
	// signMu сериализует «проверка → seqno из БД → подпись → запись»: seqno
	// не расходуется, пока строка не сохранена, и параллельные копии одного
	// request_id не подписываются дважды.
	signMu     sync.Mutex
	exchange   string
	routingKey string
	log        *zap.Logger
}

// NewWithdrawalHandler создаёт обработчик. exchange/routingKey — куда
// публиковать WITHDRAW_SIGNED.
func NewWithdrawalHandler(pub Publisher, signer Signer, repo WithdrawalRepo, exchange, routingKey string, log *zap.Logger) *WithdrawalHandler {
	return &WithdrawalHandler{
		pub:        pub,
		signer:     signer,
		repo:       repo,
		exchange:   exchange,
		routingKey: routingKey,
		log:        log.Named("withdrawal"),
	}
}

// Handle обрабатывает WITHDRAW_REQUESTED.
//
// Ошибки валидации — постоянные (сразу DLQ, повтор не исправит данные).
// Ошибки подписи и публикации классифицирует сам источник.
//
// Защита от двойного вывода: подписанный вывод сохраняется в withdrawals
// по request_id до публикации. Повторный запрос с тем же request_id не
// подписывается заново — публикуется сохранённый BOC (тот же seqno, тот же
// детерминированный message_id). Запрос с тем же request_id, но другими
// суммой/адресом/пользователем уходит в DLQ.
func (h *WithdrawalHandler) Handle(ctx context.Context, d amqp091.Delivery) error {
	if err := checkEnvelope(d, EventWithdrawRequested); err != nil {
		return amqp.Permanent(err)
	}
	var req WithdrawRequested
	if err := decodeJSON(d.Body, &req); err != nil {
		return amqp.Permanent(err)
	}
	amountNano, err := req.Validate()
	if err != nil {
		return amqp.Permanent(fmt.Errorf("invalid withdrawal request: %w", err))
	}

	log := h.log.With(
		zap.String("message_id", amqp.MessageID(d)),
		zap.String("request_id", req.RequestID),
		zap.Int64("user_id", req.UserID),
		zap.String("amount", req.Amount),
		zap.String("asset", req.Asset),
	)

	h.signMu.Lock()
	defer h.signMu.Unlock()

	w, err := h.repo.Get(ctx, req.RequestID)
	if err != nil {
		return err
	}
	if w == nil {
		// Seqno берётся из БД, а не из счётчика: если подпись или запись
		// не удались, следующий запрос получит тот же seqno — дыр нет.
		maxSeqno, err := h.repo.MaxSeqno(ctx)
		if err != nil {
			return err
		}
		signed, err := h.signer.Sign(ctx, SignRequest{
			Seqno:      maxSeqno + 1,
			RequestID:  req.RequestID,
			ToAddress:  req.ToAddress,
			AmountNano: amountNano,
			Asset:      req.Asset,
		})
		if err != nil {
			return fmt.Errorf("sign withdrawal: %w", err)
		}
		inserted, err := h.repo.InsertSigned(ctx, store.Withdrawal{
			RequestID:  req.RequestID,
			UserID:     req.UserID,
			AmountNano: amountNano,
			Asset:      req.Asset,
			ToAddress:  req.ToAddress,
			Seqno:      signed.Seqno,
			BOC:        signed.BOC,
		})
		if err != nil {
			return err
		}
		if inserted {
			w = &store.Withdrawal{RequestID: req.RequestID, UserID: req.UserID, AmountNano: amountNano,
				Asset: req.Asset, ToAddress: req.ToAddress, Seqno: signed.Seqno, BOC: signed.BOC}
		} else if w, err = h.repo.Get(ctx, req.RequestID); err != nil || w == nil {
			// Параллельная обработка успела вставить строку первой.
			return amqp.Transient(fmt.Errorf("reload withdrawal after conflict: %v", err))
		}
	} else {
		log.Info("withdrawal already signed, republishing stored BOC", zap.String("status", w.Status))
	}

	if w.UserID != 0 && (w.UserID != req.UserID || w.AmountNano != amountNano || w.ToAddress != req.ToAddress) {
		log.Error("request_id reused with different withdrawal parameters")
		return amqp.Permanent(fmt.Errorf("request %s conflicts with stored withdrawal", req.RequestID))
	}
	signed := SignedTx{BOC: w.BOC, Seqno: w.Seqno}

	body, err := json.Marshal(WithdrawSigned{RequestID: req.RequestID, BOC: signed.BOC, Seqno: signed.Seqno})
	if err != nil {
		return amqp.Permanent(fmt.Errorf("marshal signed: %w", err))
	}

	outID := DeterministicID(EventWithdrawSigned, req.RequestID)
	if err := h.pub.Publish(ctx, amqp.Message{
		Exchange:      h.exchange,
		RoutingKey:    h.routingKey,
		MessageID:     outID,
		Type:          EventWithdrawSigned,
		CorrelationID: req.RequestID,
		Body:          body,
	}); err != nil {
		return fmt.Errorf("publish signed withdrawal: %w", err)
	}

	log.Info("withdrawal signed and published",
		zap.Uint32("seqno", signed.Seqno),
		zap.String("signed_message_id", outID))
	return nil
}

// Статусы подтверждений от Broadcaster.
const (
	ResultSent      = "sent"      // отправлено в сеть, ждём включения в блок
	ResultConfirmed = "confirmed" // транзакция в блоке
	ResultFailed    = "failed"    // окончательно не прошла
)

// WithdrawResult — подтверждение от Broadcaster (withdrawals.result).
type WithdrawResult struct {
	RequestID string `json:"request_id"`
	Status    string `json:"status"`
	TxHash    string `json:"tx_hash,omitempty"`
	Seqno     uint32 `json:"seqno,omitempty"`
	Error     string `json:"error,omitempty"`
}

// Validate проверяет подтверждение.
func (r *WithdrawResult) Validate() error {
	var errs []error
	if !validUUID(r.RequestID) {
		errs = append(errs, fmt.Errorf("request_id %q is not a UUID", r.RequestID))
	}
	switch r.Status {
	case ResultSent, ResultFailed:
	case ResultConfirmed:
		if strings.TrimSpace(r.TxHash) == "" {
			errs = append(errs, errors.New("tx_hash is required for confirmed result"))
		}
	default:
		errs = append(errs, fmt.Errorf("unknown status %q", r.Status))
	}
	return errors.Join(errs...)
}

// ResultSink — куда передать подтверждение (БД, уведомление ядра и т.п.).
// Ошибку хранилища возвращайте как amqp.Transient — сообщение уйдёт на повтор.
type ResultSink interface {
	OnWithdrawResult(ctx context.Context, res WithdrawResult) error
}

// LogResultSink — MVP-реализация: только пишет в лог.
type LogResultSink struct{ log *zap.Logger }

// NewLogResultSink создаёт sink, пишущий подтверждения в лог.
func NewLogResultSink(log *zap.Logger) *LogResultSink {
	return &LogResultSink{log: log.Named("withdraw_result")}
}

// OnWithdrawResult логирует подтверждение.
func (s *LogResultSink) OnWithdrawResult(_ context.Context, res WithdrawResult) error {
	fields := []zap.Field{
		zap.String("request_id", res.RequestID),
		zap.String("status", res.Status),
		zap.String("tx_hash", res.TxHash),
		zap.Uint32("seqno", res.Seqno),
	}
	if res.Status == ResultFailed {
		s.log.Error("withdrawal failed on chain", append(fields, zap.String("error", res.Error))...)
		return nil
	}
	s.log.Info("withdrawal result", fields...)
	return nil
}

// ResultHandler обрабатывает withdrawals.result.
type ResultHandler struct {
	sink ResultSink
	m    *metrics.Metrics
}

// NewResultHandler создаёт обработчик подтверждений.
func NewResultHandler(sink ResultSink, m *metrics.Metrics) *ResultHandler {
	return &ResultHandler{sink: sink, m: m}
}

// Handle обрабатывает WITHDRAW_RESULT.
func (h *ResultHandler) Handle(ctx context.Context, d amqp091.Delivery) error {
	if err := checkEnvelope(d, EventWithdrawResult); err != nil {
		return amqp.Permanent(err)
	}
	var res WithdrawResult
	if err := decodeJSON(d.Body, &res); err != nil {
		return amqp.Permanent(err)
	}
	if err := res.Validate(); err != nil {
		return amqp.Permanent(fmt.Errorf("invalid withdrawal result: %w", err))
	}
	if err := h.sink.OnWithdrawResult(ctx, res); err != nil {
		return fmt.Errorf("handle withdrawal result: %w", err)
	}
	h.m.WithdrawResults.WithLabelValues(res.Status).Inc()
	return nil
}
