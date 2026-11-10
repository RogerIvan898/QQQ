package amqp

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	amqp091 "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/metrics"
)

// Message — исходящее сообщение. Body — уже сериализованный JSON.
type Message struct {
	Exchange      string        // "" — default exchange (прямо в очередь по имени)
	RoutingKey    string        // имя очереди / routing key
	MessageID     string        // UUID, обязателен: ключ идемпотентности у получателя
	Type          string        // тип события, например WITHDRAW_SIGNED
	CorrelationID string        // сквозной идентификатор (request_id)
	Headers       amqp091.Table // дополнительные заголовки
	Body          []byte
}

// MessagePublisher — то, что нужно консьюмеру и обработчикам от паблишера.
type MessagePublisher interface {
	Publish(ctx context.Context, msg Message) error
}

// PublisherConfig — параметры паблишера.
type PublisherConfig struct {
	AppID          string        // AMQP-свойство app_id
	ConfirmTimeout time.Duration // сколько ждать ack от брокера
}

// Publisher публикует сообщения с publisher confirms на собственном канале.
//
// Каждая публикация mandatory и блокируется до ack брокера. Ошибка
// возвращается, если брокер прислал nack, вернул сообщение (basic.return —
// нет подходящей очереди) или не подтвердил его за ConfirmTimeout.
//
// Канал открывается лениво и пересоздаётся после обрыва при следующей
// публикации. Publish безопасен для конкурентного вызова: в ожидании
// подтверждения может находиться сколько угодно сообщений одновременно.
type Publisher struct {
	client *Client
	cfg    PublisherConfig
	log    *zap.Logger
	m      *metrics.Metrics

	// sendMu сериализует открытие канала и пару
	// GetNextPublishSeqNo + Publish: номер подтверждения должен
	// соответствовать именно этой публикации.
	sendMu sync.Mutex
	sess   *publishSession
	closed bool
}

// NewPublisher создаёт паблишер поверх клиента.
func NewPublisher(client *Client, cfg PublisherConfig, log *zap.Logger, m *metrics.Metrics) *Publisher {
	return &Publisher{client: client, cfg: cfg, log: log.Named("publisher"), m: m}
}

// Publish отправляет сообщение и ждёт подтверждения брокера.
func (p *Publisher) Publish(ctx context.Context, msg Message) error {
	if msg.MessageID == "" {
		return Permanent(errors.New("publish: message_id is required"))
	}
	queue := msg.RoutingKey
	log := p.log.With(
		zap.String("exchange", msg.Exchange),
		zap.String("routing_key", msg.RoutingKey),
		zap.String("message_id", msg.MessageID),
		zap.String("type", msg.Type),
	)

	ctx, cancel := context.WithTimeout(ctx, p.cfg.ConfirmTimeout)
	defer cancel()

	start := time.Now()
	pc, sess, err := p.send(ctx, msg)
	if err != nil {
		p.m.PublishTotal.WithLabelValues(queue, metrics.PublishError).Inc()
		log.Error("publish failed", zap.Error(err))
		return err
	}

	select {
	case err := <-pc.done:
		p.m.PublishDuration.WithLabelValues(queue).Observe(time.Since(start).Seconds())
		switch {
		case err == nil:
			p.m.PublishTotal.WithLabelValues(queue, metrics.PublishAck).Inc()
			log.Debug("published", zap.Uint64("seq", pc.seq))
			return nil
		case errors.Is(err, ErrNacked):
			p.m.PublishTotal.WithLabelValues(queue, metrics.PublishNack).Inc()
		case errors.Is(err, ErrReturned):
			p.m.PublishTotal.WithLabelValues(queue, metrics.PublishReturned).Inc()
		default:
			p.m.PublishTotal.WithLabelValues(queue, metrics.PublishError).Inc()
		}
		log.Error("publish not confirmed", zap.Error(err))
		return err

	case <-ctx.Done():
		// Запись удаляется: поздний ack для неё просто проигнорируется.
		sess.remove(pc)
		p.m.PublishTotal.WithLabelValues(queue, metrics.PublishTimeout).Inc()
		log.Error("publish confirm timeout", zap.Error(ctx.Err()))
		return fmt.Errorf("%w: %s/%s: %w", ErrPublishTimeout, msg.Exchange, msg.RoutingKey, ctx.Err())
	}
}

// send регистрирует ожидание подтверждения и публикует сообщение.
func (p *Publisher) send(ctx context.Context, msg Message) (*pendingConfirm, *publishSession, error) {
	p.sendMu.Lock()
	defer p.sendMu.Unlock()

	sess, err := p.session(ctx)
	if err != nil {
		return nil, nil, err
	}

	headers := make(amqp091.Table, len(msg.Headers)+1)
	for k, v := range msg.Headers {
		headers[k] = v
	}
	headers[HeaderMessageID] = msg.MessageID

	pc := &pendingConfirm{
		seq:   sess.ch.GetNextPublishSeqNo(),
		msgID: msg.MessageID,
		done:  make(chan error, 1),
	}
	if !sess.add(pc) {
		return nil, nil, ErrChannelClosed
	}

	err = sess.ch.PublishWithContext(ctx, msg.Exchange, msg.RoutingKey,
		true,  // mandatory: непрошедшее маршрутизацию сообщение вернётся через NotifyReturn
		false, // immediate (не поддерживается RabbitMQ 3+)
		amqp091.Publishing{
			Headers:       headers,
			ContentType:   ContentTypeJSON,
			DeliveryMode:  amqp091.Persistent,
			MessageId:     msg.MessageID, // дублируем в свойство: по нему сопоставляется basic.return
			CorrelationId: msg.CorrelationID,
			Type:          msg.Type,
			Timestamp:     time.Now().UTC(),
			AppId:         p.cfg.AppID,
			Body:          msg.Body,
		})
	if err != nil {
		sess.remove(pc)
		return nil, nil, Transient(fmt.Errorf("publish: %w", err))
	}
	return pc, sess, nil
}

// session возвращает живой канал публикации или открывает новый.
// Вызывается под sendMu.
func (p *Publisher) session(ctx context.Context) (*publishSession, error) {
	if p.closed {
		return nil, ErrPublisherClosed
	}
	if p.sess != nil && !p.sess.isClosed() {
		return p.sess, nil
	}

	conn, err := p.client.Connection(ctx)
	if err != nil {
		return nil, Transient(fmt.Errorf("wait connection: %w", err))
	}
	ch, err := conn.Channel()
	if err != nil {
		return nil, Transient(fmt.Errorf("open publish channel: %w", err))
	}
	if err := ch.Confirm(false); err != nil {
		_ = ch.Close()
		return nil, Transient(fmt.Errorf("enable confirms: %w", err))
	}

	// Каналы уведомлений намеренно небуферизованные и читаются ОДНОЙ
	// горутиной dispatch. Читатель соединения amqp091 отдаёт basic.return
	// раньше, чем basic.ack для того же сообщения, и при небуферизованной
	// передаче return гарантированно обработан до ack. Дедлока нет:
	// dispatch не вызывает методов канала и держит только короткий мьютекс.
	confirms := ch.NotifyPublish(make(chan amqp091.Confirmation))
	returns := ch.NotifyReturn(make(chan amqp091.Return))
	closes := ch.NotifyClose(make(chan *amqp091.Error, 1))

	sess := &publishSession{
		ch:      ch,
		pending: make(map[uint64]*pendingConfirm),
		byMsgID: make(map[string]*pendingConfirm),
	}
	go sess.dispatch(p.log, confirms, returns, closes)

	p.sess = sess
	p.log.Info("publish channel opened")
	return sess, nil
}

// Close закрывает канал публикации. Ожидающие подтверждения публикации
// получат ErrChannelClosed.
func (p *Publisher) Close() error {
	p.sendMu.Lock()
	defer p.sendMu.Unlock()
	p.closed = true
	if p.sess == nil || p.sess.ch.IsClosed() {
		return nil
	}
	err := p.sess.ch.Close()
	if errors.Is(err, amqp091.ErrClosed) {
		err = nil
	}
	p.log.Info("publish channel closed")
	return err
}

// pendingConfirm — публикация, ожидающая ack/nack.
type pendingConfirm struct {
	seq      uint64
	msgID    string
	done     chan error // буфер 1: dispatch никогда не блокируется
	returned *amqp091.Return
}

// publishSession — состояние одного канала публикации. Номера
// подтверждений (delivery tag) уникальны только в пределах канала,
// поэтому при пересоздании канала заводится новая сессия.
type publishSession struct {
	ch *amqp091.Channel

	mu      sync.Mutex
	pending map[uint64]*pendingConfirm
	byMsgID map[string]*pendingConfirm
	closed  bool
}

func (s *publishSession) isClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed || s.ch.IsClosed()
}

func (s *publishSession) add(pc *pendingConfirm) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return false
	}
	s.pending[pc.seq] = pc
	s.byMsgID[pc.msgID] = pc
	return true
}

func (s *publishSession) remove(pc *pendingConfirm) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pending[pc.seq] == pc {
		delete(s.pending, pc.seq)
	}
	if s.byMsgID[pc.msgID] == pc {
		delete(s.byMsgID, pc.msgID)
	}
}

// dispatch разбирает подтверждения, возвраты и закрытие канала.
func (s *publishSession) dispatch(log *zap.Logger, confirms <-chan amqp091.Confirmation, returns <-chan amqp091.Return, closes <-chan *amqp091.Error) {
	for {
		select {
		case r, ok := <-returns:
			if !ok {
				returns = nil
				continue
			}
			s.onReturn(log, r)

		case c, ok := <-confirms:
			if !ok {
				// amqp091 закрывает канал подтверждений при закрытии AMQP-канала.
				s.failAll(ErrChannelClosed)
				return
			}
			s.onConfirm(c)

		case err, ok := <-closes:
			if !ok {
				closes = nil
				continue
			}
			if err != nil {
				log.Warn("publish channel closed by broker",
					zap.Int("code", err.Code), zap.String("reason", err.Reason))
			}
		}
	}
}

func (s *publishSession) onReturn(log *zap.Logger, r amqp091.Return) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if pc, ok := s.byMsgID[r.MessageId]; ok {
		ret := r
		pc.returned = &ret
	}
	log.Warn("message returned by broker",
		zap.String("message_id", r.MessageId),
		zap.String("exchange", r.Exchange),
		zap.String("routing_key", r.RoutingKey),
		zap.Uint16("reply_code", r.ReplyCode),
		zap.String("reply_text", r.ReplyText))
}

func (s *publishSession) onConfirm(c amqp091.Confirmation) {
	s.mu.Lock()
	pc, ok := s.pending[c.DeliveryTag]
	if ok {
		delete(s.pending, c.DeliveryTag)
		if s.byMsgID[pc.msgID] == pc {
			delete(s.byMsgID, pc.msgID)
		}
	}
	s.mu.Unlock()
	if !ok {
		return // публикация уже отвалилась по таймауту
	}

	switch {
	case pc.returned != nil:
		pc.done <- fmt.Errorf("%w: %d %s", ErrReturned, pc.returned.ReplyCode, pc.returned.ReplyText)
	case !c.Ack:
		pc.done <- ErrNacked
	default:
		pc.done <- nil
	}
}

func (s *publishSession) failAll(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	for seq, pc := range s.pending {
		pc.done <- err
		delete(s.pending, seq)
	}
	clear(s.byMsgID)
}
