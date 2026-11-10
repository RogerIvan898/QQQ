package handler

import (
	"context"
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
	ListSent(ctx context.Context, sentAfter time.Time, limit int) ([]store.Withdrawal, error)
	ListStale(ctx context.Context, sentBefore time.Time, afterID string, limit int) ([]store.Withdrawal, error)
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
//
// Порядок seqno: временные ошибки (сеть, 429/5xx, БД, брокер) повторяются
// прямо в обработчике с паузой, пока не пройдут, — сообщение не уходит в
// delay-очередь, и следующий seqno не обгоняет текущий. Очередь читается
// одним воркером с prefetch 1, без таймаута обработчика; остановить ожидание
// может только shutdown (тогда сообщение возвращается в очередь).
type BroadcastHandler struct {
	repo    WithdrawalRepo
	ton     ton.Client
	results *ResultPublisher
	log     *zap.Logger

	retryInitial time.Duration // первая пауза между попытками
	retryMax     time.Duration // максимальная пауза
}

// NewBroadcastHandler создаёт обработчик.
func NewBroadcastHandler(repo WithdrawalRepo, client ton.Client, results *ResultPublisher, log *zap.Logger) *BroadcastHandler {
	return &BroadcastHandler{
		repo: repo, ton: client, results: results, log: log.Named("broadcaster"),
		retryInitial: time.Second, retryMax: 30 * time.Second,
	}
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
	// Хэш сообщения считаем сами из BOC: по нему вывод ищется в сети, даже
	// если ответ sendBoc потерялся или процесс упал сразу после отправки.
	msgHash, err := ton.MessageHash(msg.BOC)
	if err != nil {
		return amqp.Permanent(err)
	}

	log := h.log.With(
		zap.String("message_id", amqp.MessageID(d)),
		zap.String("request_id", msg.RequestID),
		zap.Uint32("seqno", msg.Seqno),
		zap.String("msg_hash", msgHash))

	delay := h.retryInitial
	for attempt := 1; ; attempt++ {
		err := h.handleOnce(ctx, log, msg, msgHash)
		if err == nil || !amqp.IsTransient(err) || ctx.Err() != nil {
			return err
		}
		log.Warn("broadcast attempt failed, retrying in place to keep seqno order",
			zap.Int("attempt", attempt), zap.Duration("retry_in", delay), zap.Error(err))
		select {
		case <-ctx.Done():
			return err
		case <-time.After(delay):
		}
		if delay *= 2; delay > h.retryMax {
			delay = h.retryMax
		}
	}
}

func (h *BroadcastHandler) handleOnce(ctx context.Context, log *zap.Logger, msg WithdrawSigned, msgHash string) error {
	w, err := h.repo.Get(ctx, msg.RequestID)
	if err != nil {
		return err
	}
	if w == nil {
		// Хэш сообщения сохраняется ДО отправки.
		if _, err := h.repo.InsertSigned(ctx, store.Withdrawal{RequestID: msg.RequestID, Seqno: msg.Seqno, BOC: msg.BOC, MsgHash: msgHash}); err != nil {
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

	if _, sendErr := h.ton.SendBoc(ctx, msg.BOC); sendErr != nil {
		// Отказ может значить, что это сообщение уже в сети: процесс упал
		// между отправкой и записью sent, и кошелёк этот seqno уже принял.
		// Проверяем по хэшу, прежде чем считать отправку неудачной.
		tx, findErr := h.ton.FindTransaction(ctx, msgHash)
		if findErr != nil || tx == nil {
			return fmt.Errorf("broadcast: %w", sendErr)
		}
		log.Warn("send rejected, but the message is already on chain — treating as sent",
			zap.NamedError("send_error", sendErr), zap.String("tx_hash", tx.Hash))
	}

	if err := h.repo.MarkSent(ctx, msg.RequestID, msgHash); err != nil {
		return err
	}
	if _, err := h.results.Publish(ctx, WithdrawResult{RequestID: msg.RequestID, Status: ResultSent, Seqno: msg.Seqno}); err != nil {
		return fmt.Errorf("publish sent result: %w", err)
	}
	log.Info("withdrawal broadcast")
	return nil
}

// ConfirmPollerConfig — параметры опроса подтверждений.
type ConfirmPollerConfig struct {
	Account    string        // горячий кошелёк, с которого уходят выводы
	Interval   time.Duration // период опроса
	Timeout    time.Duration // после этого срока вывод уходит на ручной разбор
	BatchSize  int           // сколько свежих выводов сверять за проход
	ScanLimit  int           // сколько последних транзакций кошелька читать за проход
	StaleEvery int           // зависшие проверяются раз в StaleEvery проходов
	StaleBatch int           // сколько зависших проверять за раз
}

// ConfirmTON — то, что нужно опросчику от сети.
type ConfirmTON interface {
	// FindTransactions одним запросом ищет среди последних limit транзакций
	// кошелька те, что порождены внешними сообщениями с данными хэшами.
	FindTransactions(ctx context.Context, account string, msgHashes []string, limit int) (map[string]*ton.Tx, error)
	// FindTransaction ищет одну транзакцию по хэшу сообщения — для зависших,
	// которые уже выпали из окна последних транзакций.
	FindTransaction(ctx context.Context, msgHash string) (*ton.Tx, error)
}

// ConfirmPoller периодически проверяет отправленные выводы и публикует
// WITHDRAW_RESULT{confirmed|failed}.
//
// Свежие выводы (моложе CONFIRM_TIMEOUT) сверяются ОДНИМ запросом последних
// транзакций кошелька на проход: расход лимита toncenter не зависит от числа
// ожидающих выводов и почти не отнимается у broadcaster. Зависшие выводы
// проверяются отдельно, редко и по кругу (курсор по request_id), поэтому не
// забивают выборку и не мешают свежим.
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
	ton     ConfirmTON
	results *ResultPublisher
	log     *zap.Logger
	now     func() time.Time

	passes       int
	staleAfterID string // курсор обхода зависших по кругу
}

// NewConfirmPoller создаёт опросчик.
func NewConfirmPoller(cfg ConfirmPollerConfig, repo WithdrawalRepo, client ConfirmTON, results *ResultPublisher, log *zap.Logger) *ConfirmPoller {
	if cfg.StaleEvery < 1 {
		cfg.StaleEvery = 12
	}
	if cfg.StaleBatch < 1 {
		cfg.StaleBatch = 5
	}
	if cfg.ScanLimit < 1 {
		cfg.ScanLimit = 100
	}
	return &ConfirmPoller{cfg: cfg, repo: repo, ton: client, results: results, log: log.Named("confirm_poller"), now: time.Now}
}

// Run опрашивает до отмены ctx; начатый проход дорабатывается.
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

// Poll — один проход: свежие выводы, а раз в StaleEvery проходов — зависшие.
func (p *ConfirmPoller) Poll(ctx context.Context) {
	work := context.WithoutCancel(ctx)
	cutoff := p.now().Add(-p.cfg.Timeout)
	p.pollFresh(work, cutoff)

	p.passes++
	if p.passes%p.cfg.StaleEvery == 0 && ctx.Err() == nil {
		p.pollStale(work, cutoff)
	}
}

func (p *ConfirmPoller) pollFresh(ctx context.Context, cutoff time.Time) {
	qctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	fresh, err := p.repo.ListSent(qctx, cutoff, p.cfg.BatchSize)
	cancel()
	if err != nil {
		p.log.Warn("list sent withdrawals failed", zap.Error(err))
		return
	}
	if len(fresh) == 0 {
		return
	}

	hashes := make([]string, 0, len(fresh))
	for _, w := range fresh {
		hashes = append(hashes, w.MsgHash)
	}
	fctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	found, err := p.ton.FindTransactions(fctx, p.cfg.Account, hashes, p.cfg.ScanLimit)
	cancel()
	if err != nil {
		p.log.Warn("scan wallet transactions failed", zap.Error(err))
		return
	}
	for _, w := range fresh {
		if tx := found[w.MsgHash]; tx != nil {
			p.finalize(ctx, w, tx)
		}
	}
}

func (p *ConfirmPoller) pollStale(ctx context.Context, cutoff time.Time) {
	qctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	stale, err := p.repo.ListStale(qctx, cutoff, p.staleAfterID, p.cfg.StaleBatch)
	cancel()
	if err != nil {
		p.log.Warn("list stale withdrawals failed", zap.Error(err))
		return
	}
	if len(stale) < p.cfg.StaleBatch {
		p.staleAfterID = "" // круг пройден — в следующий раз с начала
	} else {
		p.staleAfterID = stale[len(stale)-1].RequestID
	}

	for _, w := range stale {
		fctx, cancel := context.WithTimeout(ctx, 30*time.Second)
		tx, err := p.ton.FindTransaction(fctx, w.MsgHash)
		cancel()
		if err != nil {
			p.log.Warn("find transaction failed", zap.String("request_id", w.RequestID), zap.Error(err))
			continue
		}
		if tx != nil {
			p.finalize(ctx, w, tx)
			continue
		}
		// Не объявляем failed: BOC ещё может попасть в блок, и тогда ядро
		// вернуло бы деньги за прошедший вывод. Решение — за человеком.
		p.log.Error("transaction not found within confirm timeout, manual review required",
			zap.String("request_id", w.RequestID), zap.Uint32("seqno", w.Seqno),
			zap.String("msg_hash", w.MsgHash), zap.Time("sent_at", w.SentAt), zap.Duration("timeout", p.cfg.Timeout))
	}
}

// finalize публикует итог найденной транзакции и записывает его в БД.
func (p *ConfirmPoller) finalize(ctx context.Context, w store.Withdrawal, tx *ton.Tx) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	log := p.log.With(zap.String("request_id", w.RequestID), zap.Uint32("seqno", w.Seqno), zap.String("msg_hash", w.MsgHash))

	res := WithdrawResult{RequestID: w.RequestID, Status: ResultConfirmed, TxHash: tx.Hash, Seqno: w.Seqno}
	if !tx.Success {
		res.Status, res.Error = ResultFailed, tx.Reason
	}

	if _, err := p.results.Publish(ctx, res); err != nil {
		log.Error("publish result failed, will retry", zap.String("status", res.Status), zap.Error(err))
		return
	}
	var err error
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
