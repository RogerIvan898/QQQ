package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	amqp091 "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
	"gitlab.com/company-group7340831/poker/chain-service/internal/store"
	"gitlab.com/company-group7340831/poker/chain-service/internal/ton"
)

// WithdrawalRepo — история выводов (реализация — store.Withdrawals).
type WithdrawalRepo interface {
	Get(ctx context.Context, requestID string) (*store.Withdrawal, error)
	InsertSigned(ctx context.Context, w store.Withdrawal) (bool, error)
	MarkSent(ctx context.Context, requestID, msgHash string) error
	MarkConfirmed(ctx context.Context, requestID, txHash string) error
	MarkFailed(ctx context.Context, requestID, txHash, reason string) error
	MaxSeqno(ctx context.Context) (uint32, error)
	ListSent(ctx context.Context, limit int) ([]store.Withdrawal, error)
}

// ResultPublisher публикует WITHDRAW_RESULT. message_id детерминирован от
// request_id и статуса: повторная публикация того же итога — дубль, который
// получатель отбросит.
type ResultPublisher struct {
	pub        Publisher
	exchange   string
	routingKey string
}

// NewResultPublisher создаёт публикатор результатов.
func NewResultPublisher(pub Publisher, exchange, routingKey string) *ResultPublisher {
	return &ResultPublisher{pub: pub, exchange: exchange, routingKey: routingKey}
}

// Publish отправляет результат и ждёт подтверждения брокера.
func (p *ResultPublisher) Publish(ctx context.Context, res WithdrawResult) (string, error) {
	body, err := json.Marshal(res)
	if err != nil {
		return "", amqp.Permanent(err)
	}
	id := DeterministicID(EventWithdrawResult+":"+res.Status, res.RequestID)
	err = p.pub.Publish(ctx, amqp.Message{
		Exchange:      p.exchange,
		RoutingKey:    p.routingKey,
		MessageID:     id,
		Type:          EventWithdrawResult,
		CorrelationID: res.RequestID,
		Body:          body,
	})
	return id, err
}

// BroadcastHandler: withdrawals.signed → отправка в TON → WITHDRAW_RESULT{sent}.
//
// Двойной отправки не будет:
//   - строка withdrawals по request_id хранит хэш BOC; другой BOC для того
//     же request_id не отправляется (уходит в DLQ на разбор);
//   - уже отправленный/завершённый вывод повторно не отправляется;
//   - повторная отправка ТОГО ЖЕ BOC безопасна на уровне сети: кошелёк
//     примет сообщение с данным seqno только один раз.
type BroadcastHandler struct {
	repo    WithdrawalRepo
	ton     ton.Client
	results *ResultPublisher
	log     *zap.Logger
}

// NewBroadcastHandler создаёт обработчик.
func NewBroadcastHandler(repo WithdrawalRepo, client ton.Client, results *ResultPublisher, log *zap.Logger) *BroadcastHandler {
	return &BroadcastHandler{repo: repo, ton: client, results: results, log: log.Named("broadcaster")}
}

// Handle обрабатывает WITHDRAW_SIGNED.
func (h *BroadcastHandler) Handle(ctx context.Context, d amqp091.Delivery) error {
	if err := checkEnvelope(d, EventWithdrawSigned); err != nil {
		return amqp.Permanent(err)
	}
	var msg WithdrawSigned
	if err := decodeJSON(d.Body, &msg); err != nil {
		return amqp.Permanent(err)
	}
	if !validUUID(msg.RequestID) {
		return amqp.Permanent(fmt.Errorf("request_id %q is not a UUID", msg.RequestID))
	}
	if _, err := base64.StdEncoding.DecodeString(msg.BOC); err != nil || msg.BOC == "" {
		return amqp.Permanent(errors.New("boc is not valid base64"))
	}

	log := h.log.With(
		zap.String("message_id", amqp.MessageID(d)),
		zap.String("request_id", msg.RequestID),
		zap.Uint32("seqno", msg.Seqno))

	w, err := h.repo.Get(ctx, msg.RequestID)
	if err != nil {
		return err
	}
	if w == nil {
		// Подпись делал другой сервис или другая БД — заводим строку сами.
		if _, err := h.repo.InsertSigned(ctx, store.Withdrawal{RequestID: msg.RequestID, Seqno: msg.Seqno, BOC: msg.BOC}); err != nil {
			return err
		}
		if w, err = h.repo.Get(ctx, msg.RequestID); err != nil {
			return err
		}
		if w == nil {
			return amqp.Transient(errors.New("withdrawal row disappeared after insert"))
		}
	}

	if w.BOCHash != store.BOCHash(msg.BOC) {
		log.Error("BOC differs from the stored one for this request, refusing to broadcast")
		return amqp.Permanent(fmt.Errorf("conflicting boc for request %s", msg.RequestID))
	}

	switch w.Status {
	case store.StatusConfirmed, store.StatusFailed:
		log.Info("withdrawal already finalized, skip", zap.String("status", w.Status))
		return nil
	case store.StatusSent:
		// Отправка прошла, но результат мог не опубликоваться — повторяем
		// публикацию (тот же message_id).
		log.Info("withdrawal already sent, republishing result")
		_, err := h.results.Publish(ctx, WithdrawResult{RequestID: w.RequestID, Status: ResultSent, Seqno: w.Seqno})
		return err
	}

	msgHash, err := h.ton.SendBoc(ctx, msg.BOC)
	if err != nil {
		return fmt.Errorf("broadcast: %w", err)
	}
	if err := h.repo.MarkSent(ctx, msg.RequestID, msgHash); err != nil {
		// Сообщение уйдёт на повтор и отправит тот же BOC ещё раз — безопасно.
		return err
	}
	if _, err := h.results.Publish(ctx, WithdrawResult{RequestID: msg.RequestID, Status: ResultSent, Seqno: msg.Seqno}); err != nil {
		return fmt.Errorf("publish sent result: %w", err)
	}
	log.Info("withdrawal broadcast", zap.String("msg_hash", msgHash))
	return nil
}

// ConfirmPollerConfig — параметры опроса подтверждений.
type ConfirmPollerConfig struct {
	Interval  time.Duration
	Timeout   time.Duration // после этого срока вывод уходит на ручной разбор
	BatchSize int
}

// ConfirmPoller периодически проверяет отправленные выводы и публикует
// WITHDRAW_RESULT{confirmed|failed}.
//
// Порядок «сначала публикация, потом запись в БД»: если запись не удастся,
// следующий опрос опубликует тот же результат с тем же message_id.
//
// По истечении CONFIRM_TIMEOUT вывод НЕ объявляется failed (транзакция
// ещё может пройти): опросчик пишет ошибку для ручного разбора и
// продолжает проверять. failed — только для найденной прерванной транзакции.
type ConfirmPoller struct {
	cfg     ConfirmPollerConfig
	repo    WithdrawalRepo
	ton     ton.Client
	results *ResultPublisher
	log     *zap.Logger
	now     func() time.Time
}

// NewConfirmPoller создаёт опросчик.
func NewConfirmPoller(cfg ConfirmPollerConfig, repo WithdrawalRepo, client ton.Client, results *ResultPublisher, log *zap.Logger) *ConfirmPoller {
	return &ConfirmPoller{cfg: cfg, repo: repo, ton: client, results: results, log: log.Named("confirm_poller"), now: time.Now}
}

// Run опрашивает до отмены ctx; начатая пачка дорабатывается.
func (p *ConfirmPoller) Run(ctx context.Context) error {
	p.log.Info("confirm poller started", zap.Duration("interval", p.cfg.Interval), zap.Duration("timeout", p.cfg.Timeout))
	t := time.NewTicker(p.cfg.Interval)
	defer t.Stop()
	for {
		p.Poll(ctx)
		select {
		case <-ctx.Done():
			p.log.Info("confirm poller stopped")
			return nil
		case <-t.C:
		}
	}
}

// Poll — один проход по отправленным выводам.
func (p *ConfirmPoller) Poll(ctx context.Context) {
	work := context.WithoutCancel(ctx)
	qctx, cancel := context.WithTimeout(work, 10*time.Second)
	sent, err := p.repo.ListSent(qctx, p.cfg.BatchSize)
	cancel()
	if err != nil {
		p.log.Warn("list sent withdrawals failed", zap.Error(err))
		return
	}
	for _, w := range sent {
		if ctx.Err() != nil {
			return
		}
		wctx, cancel := context.WithTimeout(work, 30*time.Second)
		p.check(wctx, w)
		cancel()
	}
}

func (p *ConfirmPoller) check(ctx context.Context, w store.Withdrawal) {
	log := p.log.With(zap.String("request_id", w.RequestID), zap.Uint32("seqno", w.Seqno), zap.String("msg_hash", w.MsgHash))

	tx, err := p.ton.FindTransaction(ctx, w.MsgHash)
	if err != nil {
		log.Warn("find transaction failed", zap.Error(err))
		return
	}

	var res WithdrawResult
	switch {
	case tx != nil && tx.Success:
		res = WithdrawResult{RequestID: w.RequestID, Status: ResultConfirmed, TxHash: tx.Hash, Seqno: w.Seqno}
	case tx != nil:
		res = WithdrawResult{RequestID: w.RequestID, Status: ResultFailed, TxHash: tx.Hash, Seqno: w.Seqno, Error: tx.Reason}
	case !w.SentAt.IsZero() && p.now().Sub(w.SentAt) > p.cfg.Timeout:
		// Не объявляем failed: BOC ещё может попасть в блок, и тогда ядро
		// вернуло бы деньги за прошедший вывод. Вывод остаётся sent и
		// продолжает проверяться; решение — за человеком.
		log.Error("transaction not found within confirm timeout, manual review required",
			zap.Duration("timeout", p.cfg.Timeout), zap.Time("sent_at", w.SentAt))
		return
	default:
		return // ещё ждём
	}

	if _, err := p.results.Publish(ctx, res); err != nil {
		log.Error("publish result failed, will retry", zap.String("status", res.Status), zap.Error(err))
		return
	}
	if res.Status == ResultConfirmed {
		err = p.repo.MarkConfirmed(ctx, w.RequestID, res.TxHash)
	} else {
		err = p.repo.MarkFailed(ctx, w.RequestID, res.TxHash, res.Error)
	}
	if err != nil {
		log.Error("store result failed, will republish", zap.String("status", res.Status), zap.Error(err))
		return
	}
	if res.Status == ResultConfirmed {
		log.Info("withdrawal confirmed", zap.String("tx_hash", res.TxHash))
	} else {
		log.Error("withdrawal failed", zap.String("tx_hash", res.TxHash), zap.String("reason", res.Error))
	}
}
