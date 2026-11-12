package withdrawal

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/rabbitmq/amqp091-go"
	"github.com/xssnick/tonutils-go/address"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
	"gitlab.com/company-group7340831/poker/chain-service/internal/events"
	"gitlab.com/company-group7340831/poker/chain-service/internal/failure"
	"gitlab.com/company-group7340831/poker/chain-service/internal/schedule"
	"gitlab.com/company-group7340831/poker/chain-service/internal/ton"
)

// Паузы между попытками отправки при временных ошибках: от первой до
// максимальной, удваиваясь.
const (
	broadcastRetryInitial = time.Second
	broadcastRetryMax     = 30 * time.Second
)

// attemptTimeout — предел одной попытки: запросы к БД, отправка в сеть и
// публикация результата. Истечение — временная ошибка, попытка повторится.
const attemptTimeout = 2 * time.Minute

// Broadcaster: withdrawals.signed → отправка в TON → WITHDRAW_RESULT{sent}.
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
type Broadcaster struct {
	cfg     BroadcasterConfig
	repo    Repository
	ton     ton.Client
	results *ResultPublisher
	log     *zap.Logger

	retryInitial time.Duration // первая пауза между попытками
	retryMax     time.Duration // максимальная пауза
}

// BroadcasterConfig — проверки входящих выводов и наблюдение за повторами.
// Пустые поля отключают соответствующую проверку (локальный стенд, тесты).
type BroadcasterConfig struct {
	// SignerUser — пользователь RabbitMQ сервиса подписи. Сообщение с другим
	// AMQP user_id отклоняется: RabbitMQ не даёт подделать это свойство,
	// поэтому чужой сервис не займёт request_id мусорным BOC.
	SignerUser string
	// Wallet — горячий кошелёк. BOC, адресованный другому кошельку, не
	// отправляется: его подтверждение никогда не нашлось бы.
	Wallet *address.Address
	// OnAttempt получает номер текущей попытки (0 — вывод обработан или
	// отклонён): метрика застрявшего вывода.
	OnAttempt func(attempt int)
}

// Попытка с этим номером и дальше пишется в лог как ошибка: вывод застрял.
const stuckAttempt = 10

// NewBroadcaster создаёт обработчик.
func NewBroadcaster(cfg BroadcasterConfig, repo Repository, client ton.Client, results *ResultPublisher, log *zap.Logger) *Broadcaster {
	if cfg.OnAttempt == nil {
		cfg.OnAttempt = func(int) {}
	}
	return &Broadcaster{
		cfg: cfg, repo: repo, ton: client, results: results, log: log.Named("broadcaster"),
		retryInitial: broadcastRetryInitial, retryMax: broadcastRetryMax,
	}
}

// Handle обрабатывает WITHDRAW_SIGNED.
func (h *Broadcaster) Handle(ctx context.Context, d amqp091.Delivery) error {
	if err := events.CheckEnvelope(d, events.WithdrawSigned); err != nil {
		return failure.Permanent(err)
	}
	if h.cfg.SignerUser != "" && d.UserId != h.cfg.SignerUser {
		h.log.Error("signed withdrawal from unexpected sender, rejecting",
			zap.String("message_id", amqp.MessageID(d)), zap.String("user_id", d.UserId))
		return failure.Permanent(fmt.Errorf("sender %q is not the signing service", d.UserId))
	}
	var msg Signed
	if err := events.DecodeJSON(d.Body, &msg); err != nil {
		return failure.Permanent(err)
	}
	if !events.ValidUUID(msg.RequestID) {
		return failure.Permanent(fmt.Errorf("request_id %q is not a UUID", msg.RequestID))
	}
	// Хэш сообщения считаем сами из BOC: по нему вывод ищется в сети, даже
	// если ответ sendBoc потерялся или процесс упал сразу после отправки.
	msgHash, err := ton.MessageHash(msg.BOC)
	if err != nil {
		return failure.Permanent(err)
	}
	if h.cfg.Wallet != nil {
		dst, err := ton.ExternalDestination(msg.BOC)
		if err != nil {
			return failure.Permanent(err)
		}
		if !dst.Equals(h.cfg.Wallet) {
			return failure.Permanent(fmt.Errorf("boc is addressed to %s, not to the hot wallet", dst.StringRaw()))
		}
	}

	log := h.log.With(
		zap.String("message_id", amqp.MessageID(d)),
		zap.String("request_id", msg.RequestID),
		zap.Uint32("seqno", msg.Seqno),
		zap.String("msg_hash", msgHash))

	defer h.cfg.OnAttempt(0)
	delay := h.retryInitial
	for attempt := 1; ; attempt++ {
		h.cfg.OnAttempt(attempt)
		err := h.handleOnce(ctx, log, msg, msgHash)
		if err == nil || !failure.IsTransient(err) || ctx.Err() != nil {
			return err
		}
		level := zap.WarnLevel
		if attempt >= stuckAttempt {
			level = zap.ErrorLevel // очередь выводов стоит: нужен человек
		}
		log.Log(level, "broadcast attempt failed, retrying in place to keep seqno order",
			zap.Int("attempt", attempt), zap.Duration("retry_in", delay), zap.Error(err))
		if !schedule.Sleep(ctx, delay) {
			return err
		}
		if delay *= 2; delay > h.retryMax {
			delay = h.retryMax
		}
	}
}

func (h *Broadcaster) handleOnce(ctx context.Context, log *zap.Logger, msg Signed, msgHash string) error {
	// Сам обработчик без таймаута (порядок seqno), но одна попытка ограничена:
	// иначе повисшее соединение с PostgreSQL остановило бы выводы навсегда.
	ctx, cancel := context.WithTimeout(ctx, attemptTimeout)
	defer cancel()

	w, err := h.repo.Get(ctx, msg.RequestID)
	if err != nil {
		return err
	}
	if w == nil {
		// Хэш сообщения сохраняется ДО отправки.
		if _, err := h.repo.InsertSigned(ctx, Withdrawal{RequestID: msg.RequestID, Seqno: msg.Seqno, BOC: msg.BOC, MsgHash: msgHash}); err != nil {
			return err
		}
		if w, err = h.repo.Get(ctx, msg.RequestID); err != nil {
			return err
		}
		if w == nil {
			return failure.Transient(errors.New("withdrawal row disappeared after insert"))
		}
	}

	if w.BOCHash != BOCHash(msg.BOC) {
		log.Error("BOC differs from the stored one for this request, refusing to broadcast")
		return failure.Permanent(fmt.Errorf("conflicting boc for request %s", msg.RequestID))
	}

	switch w.Status {
	case StatusConfirmed, StatusFailed:
		log.Info("withdrawal already finalized, skip", zap.String("status", string(w.Status)))
		return nil
	case StatusSent:
		// Отправка прошла, но результат мог не опубликоваться — повторяем
		// публикацию (тот же message_id).
		log.Info("withdrawal already sent, republishing result")
		_, err := h.results.Publish(ctx, Result{RequestID: w.RequestID, Status: ResultSent, Seqno: w.Seqno})
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
	if _, err := h.results.Publish(ctx, Result{RequestID: msg.RequestID, Status: ResultSent, Seqno: msg.Seqno}); err != nil {
		return fmt.Errorf("publish sent result: %w", err)
	}
	log.Info("withdrawal broadcast")
	return nil
}
