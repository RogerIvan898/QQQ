package amqp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	amqp091 "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/metrics"
)

// Handler обрабатывает одно сообщение.
//
// nil — успех (сообщение будет подтверждено). Ошибка классифицируется через
// IsTransient: временная уходит на повтор через delay-очередь, постоянная
// (или после исчерпания попыток) — в DLQ. Чтобы явно указать тип ошибки,
// оборачивайте её в Permanent или Transient.
type Handler func(ctx context.Context, d amqp091.Delivery) error

// IdempotencyStore — хранилище уже обработанных message_id.
//
// Mark вызывается только после успешной обработки и до ack: если ack
// потеряется и брокер доставит сообщение повторно, оно будет распознано
// как дубликат и просто подтверждено.
type IdempotencyStore interface {
	Seen(messageID string) bool
	Mark(messageID string)
}

// ConsumerConfig — параметры консьюмера одной очереди.
type ConsumerConfig struct {
	Queue            string
	TagPrefix        string        // префикс consumer tag (обычно hostname)
	Prefetch         int           // basic.qos prefetch_count
	Workers          int           // сколько сообщений обрабатывается параллельно
	MaxRetries       int           // максимум x-retry-count, дальше DLQ
	RetryQueues      []RetryQueue  // delay-очереди по номеру попытки
	HandlerTimeout   time.Duration // таймаут одного вызова обработчика
	ResubscribeDelay time.Duration // пауза перед повторной подпиской после обрыва
	MaxBodyBytes     int           // максимальный размер тела; больше — сразу в DLQ (0 — без лимита)
}

// Consumer читает очередь с ручным ack и пулом воркеров.
type Consumer struct {
	cfg     ConsumerConfig
	client  *Client
	pub     MessagePublisher
	idem    IdempotencyStore
	handler Handler
	log     *zap.Logger
	m       *metrics.Metrics
	tag     string

	// runCtx отменяется Shutdown'ом (или родительским ctx Run) и
	// останавливает переподписку.
	runCtx  context.Context
	stopRun context.CancelFunc
	// workCtx — контекст обработчиков. Он НЕ отменяется по сигналу:
	// in-flight сообщения должны доработать. Отменяется, только если
	// истёк SHUTDOWN_TIMEOUT.
	workCtx    context.Context
	cancelWork context.CancelFunc

	mu sync.Mutex
	ch *amqp091.Channel

	inflight   sync.WaitGroup // обработчики в работе
	processing sync.Map       // message_id → struct{}: защита от параллельной обработки дублей
	runDone    chan struct{}
}

// NewConsumer создаёт консьюмер. Запуск — Run, остановка — Shutdown.
func NewConsumer(cfg ConsumerConfig, client *Client, pub MessagePublisher, idem IdempotencyStore, h Handler, log *zap.Logger, m *metrics.Metrics) *Consumer {
	if cfg.Workers < 1 {
		cfg.Workers = 1
	}
	if cfg.ResubscribeDelay <= 0 {
		cfg.ResubscribeDelay = time.Second
	}
	if cfg.TagPrefix == "" {
		cfg.TagPrefix, _ = os.Hostname()
	}

	c := &Consumer{
		cfg:     cfg,
		client:  client,
		pub:     pub,
		idem:    idem,
		handler: h,
		log:     log.Named("consumer").With(zap.String("queue", cfg.Queue)),
		m:       m,
		tag:     fmt.Sprintf("%s.%s.%s", cfg.TagPrefix, cfg.Queue, uuid.NewString()[:8]),
		runDone: make(chan struct{}),
	}
	c.runCtx, c.stopRun = context.WithCancel(context.Background())
	c.workCtx, c.cancelWork = context.WithCancel(context.Background())
	return c
}

// Run подписывается на очередь и обрабатывает сообщения, пока не будет
// вызван Shutdown или отменён parent. После обрыва канала или соединения
// подписка восстанавливается автоматически.
func (c *Consumer) Run(parent context.Context) error {
	defer close(c.runDone)
	stop := context.AfterFunc(parent, c.stopRun)
	defer stop()

	ctx := c.runCtx
	for {
		if ctx.Err() != nil {
			return nil
		}

		ch, deliveries, err := c.subscribe(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			c.log.Error("subscribe failed", zap.Error(err), zap.Duration("retry_in", c.cfg.ResubscribeDelay))
			_ = sleepCtx(ctx, c.cfg.ResubscribeDelay)
			continue
		}

		c.dispatch(deliveries)

		if ctx.Err() != nil {
			// Штатная остановка: канал закроет Shutdown после in-flight.
			return nil
		}

		// Канал или соединение оборвались (или брокер отменил подписку).
		// Дожидаемся обработчиков этой сессии: их ack, скорее всего, не
		// пройдёт, брокер вернёт сообщения в очередь, а идемпотентность
		// отсечёт уже обработанные.
		c.log.Warn("delivery channel closed, resubscribing")
		c.inflight.Wait()
		c.closeChannel(ch)
		_ = sleepCtx(ctx, c.cfg.ResubscribeDelay)
	}
}

// subscribe открывает канал consume, выставляет QoS и подписывается.
func (c *Consumer) subscribe(ctx context.Context) (*amqp091.Channel, <-chan amqp091.Delivery, error) {
	conn, err := c.client.Connection(ctx)
	if err != nil {
		return nil, nil, err
	}
	ch, err := conn.Channel()
	if err != nil {
		return nil, nil, fmt.Errorf("open consume channel: %w", err)
	}
	if err := ch.Qos(c.cfg.Prefetch, 0, false); err != nil {
		_ = ch.Close()
		return nil, nil, fmt.Errorf("qos: %w", err)
	}
	deliveries, err := ch.Consume(c.cfg.Queue, c.tag,
		false, // autoAck: только ручной ack после успешной обработки
		false, // exclusive
		false, // noLocal
		false, // noWait
		nil,
	)
	if err != nil {
		_ = ch.Close()
		return nil, nil, fmt.Errorf("consume: %w", err)
	}

	// Публикуем канал под мьютексом и проверяем остановку там же: если
	// Shutdown уже прошёл, сам закрываем канал — неподтверждённые
	// сообщения брокер вернёт в очередь.
	c.mu.Lock()
	if ctx.Err() != nil {
		c.mu.Unlock()
		_ = ch.Close()
		return nil, nil, ctx.Err()
	}
	c.ch = ch
	c.mu.Unlock()

	c.log.Info("consumer subscribed",
		zap.String("consumer_tag", c.tag),
		zap.Int("prefetch", c.cfg.Prefetch),
		zap.Int("workers", c.cfg.Workers))
	return ch, deliveries, nil
}

// dispatch раздаёт доставки воркерам до закрытия канала доставок.
func (c *Consumer) dispatch(deliveries <-chan amqp091.Delivery) {
	sem := make(chan struct{}, c.cfg.Workers)
	for d := range deliveries {
		sem <- struct{}{} // backpressure: не больше Workers обработчиков
		c.inflight.Add(1)
		go func(d amqp091.Delivery) {
			defer func() {
				<-sem
				c.inflight.Done()
			}()
			c.handle(d)
		}(d)
	}
}

// handle — полный цикл обработки одного сообщения.
func (c *Consumer) handle(d amqp091.Delivery) {
	log := c.log.With(
		zap.Uint64("delivery_tag", d.DeliveryTag),
		zap.Bool("redelivered", d.Redelivered),
	)

	// Обработчики уже прерваны таймаутом остановки: вернуть в очередь.
	if c.workCtx.Err() != nil {
		c.nack(d, log, true, metrics.ConsumeRequeued)
		return
	}

	// Огромное тело не разбираем: оно лишь тратило бы память и CPU, пока
	// очередь стоит.
	if c.cfg.MaxBodyBytes > 0 && len(d.Body) > c.cfg.MaxBodyBytes {
		log.Error("message body too large, sending to DLQ",
			zap.Int("size", len(d.Body)), zap.Int("limit", c.cfg.MaxBodyBytes))
		c.toDLQ(d, log)
		return
	}

	msgID := MessageID(d)
	if _, err := uuid.Parse(msgID); err != nil {
		log.Error("message without valid message_id, sending to DLQ", zap.String("message_id", msgID))
		c.toDLQ(d, log)
		return
	}
	retry := RetryCount(d.Headers)
	log = log.With(zap.String("message_id", msgID), zap.Int("retry", retry))

	// Две копии одного сообщения (например, повтор после потерянного ack)
	// не должны обрабатываться параллельно: вторая возвращается в очередь
	// и после завершения первой будет отсечена как дубликат.
	if _, busy := c.processing.LoadOrStore(msgID, struct{}{}); busy {
		// Возвращаем в очередь с паузой (без паузы копия крутилась бы
		// через брокер вхолостую), но воркер не держим: nack по таймеру.
		// inflight учитывает отложенный nack, чтобы Shutdown его дождался.
		log.Warn("same message_id is being processed, requeue later")
		c.inflight.Add(1)
		time.AfterFunc(500*time.Millisecond, func() {
			defer c.inflight.Done()
			c.nack(d, log, true, metrics.ConsumeRequeued)
		})
		return
	}
	defer c.processing.Delete(msgID)

	if c.idem.Seen(msgID) {
		log.Info("duplicate message, ack without processing")
		c.ack(d, log, metrics.ConsumeDuplicate)
		return
	}

	log.Debug("message received")
	// HandlerTimeout <= 0 — без таймаута (обработчик сам решает, сколько
	// ждать; прервать его может только shutdown через workCtx).
	hctx, cancel := context.WithCancel(c.workCtx)
	if c.cfg.HandlerTimeout > 0 {
		hctx, cancel = context.WithTimeout(c.workCtx, c.cfg.HandlerTimeout)
	}
	start := time.Now()
	err := c.handler(hctx, d)
	cancel()
	c.m.HandlerDuration.WithLabelValues(c.cfg.Queue).Observe(time.Since(start).Seconds())

	if err == nil {
		c.idem.Mark(msgID)
		if c.ack(d, log, metrics.ConsumeOK) {
			log.Info("message processed", zap.Duration("took", time.Since(start)))
		}
		return
	}

	if c.workCtx.Err() != nil {
		log.Warn("processing aborted by shutdown, requeue", zap.Error(err))
		c.nack(d, log, true, metrics.ConsumeRequeued)
		return
	}

	c.fail(d, log, msgID, retry, err)
}

// fail решает судьбу сообщения с ошибкой: повтор или DLQ.
func (c *Consumer) fail(d amqp091.Delivery, log *zap.Logger, msgID string, retry int, handlerErr error) {
	transient := IsTransient(handlerErr)
	if transient && retry < c.cfg.MaxRetries && retry < len(c.cfg.RetryQueues) {
		rq := c.cfg.RetryQueues[retry]
		err := c.pub.Publish(c.workCtx, Message{
			Exchange:      "", // default exchange: прямо в delay-очередь
			RoutingKey:    rq.Name,
			MessageID:     msgID, // тот же message_id: ключ идемпотентности сохраняется
			Type:          d.Type,
			CorrelationID: d.CorrelationId,
			Headers:       retryHeaders(d.Headers, msgID, retry+1, c.cfg.Queue, handlerErr),
			Body:          d.Body,
		})
		if err != nil {
			// Не удалось поставить повтор — сообщение нельзя ни терять,
			// ни отправлять в DLQ из-за проблем брокера: возвращаем в
			// очередь с паузой, чтобы не крутить горячий цикл.
			log.Error("schedule retry failed, requeue",
				zap.NamedError("handler_error", handlerErr), zap.Error(err))
			_ = sleepCtx(c.workCtx, time.Second)
			c.nack(d, log, true, metrics.ConsumeRequeued)
			return
		}
		c.m.RetryTotal.WithLabelValues(c.cfg.Queue).Inc()
		log.Warn("transient error, retry scheduled",
			zap.Error(handlerErr),
			zap.Int("attempt", retry+1),
			zap.Int("max_retries", c.cfg.MaxRetries),
			zap.Duration("delay", rq.Delay),
			zap.String("retry_queue", rq.Name))
		c.ack(d, log, metrics.ConsumeRetry)
		return
	}

	log.Error("processing failed, sending to DLQ",
		zap.Error(handlerErr),
		zap.Bool("transient", transient),
		zap.Bool("retries_exhausted", transient))
	c.toDLQ(d, log)
}

// toDLQ — Nack без requeue: RabbitMQ перекладывает сообщение в queue.dlq
// по x-dead-letter-routing-key основной очереди.
func (c *Consumer) toDLQ(d amqp091.Delivery, log *zap.Logger) {
	if c.nack(d, log, false, metrics.ConsumeDLQ) {
		c.m.DLQTotal.WithLabelValues(c.cfg.Queue).Inc()
	}
}

func (c *Consumer) ack(d amqp091.Delivery, log *zap.Logger, status string) bool {
	if err := d.Ack(false); err != nil {
		// Канал умер: брокер вернёт сообщение в очередь сам.
		log.Error("ack failed", zap.Error(err))
		c.m.ConsumeTotal.WithLabelValues(c.cfg.Queue, metrics.ConsumeAckError).Inc()
		return false
	}
	c.m.ConsumeTotal.WithLabelValues(c.cfg.Queue, status).Inc()
	return true
}

func (c *Consumer) nack(d amqp091.Delivery, log *zap.Logger, requeue bool, status string) bool {
	if err := d.Nack(false, requeue); err != nil {
		log.Error("nack failed", zap.Error(err), zap.Bool("requeue", requeue))
		c.m.ConsumeTotal.WithLabelValues(c.cfg.Queue, metrics.ConsumeNackError).Inc()
		return false
	}
	c.m.ConsumeTotal.WithLabelValues(c.cfg.Queue, status).Inc()
	return true
}

// Shutdown останавливает консьюмер:
//  1. ch.Cancel(tag, false) — брокер перестаёт присылать новые сообщения;
//  2. ждёт выхода Run и всех in-flight обработчиков (sync.WaitGroup);
//  3. если ctx истёк — отменяет контекст обработчиков, они возвращают
//     сообщения в очередь;
//  4. закрывает канал consume.
func (c *Consumer) Shutdown(ctx context.Context) error {
	c.stopRun()

	c.mu.Lock()
	ch := c.ch
	c.mu.Unlock()

	if ch != nil && !ch.IsClosed() {
		if err := ch.Cancel(c.tag, false); err != nil {
			c.log.Warn("consumer cancel failed", zap.Error(err))
		} else {
			c.log.Info("consumer cancelled, draining in-flight messages", zap.String("consumer_tag", c.tag))
		}
	}

	const abortGrace = 5 * time.Second
	var errs []error

	// Run должен выйти раньше, чем мы начнём ждать WaitGroup: после этого
	// новых Add уже не будет.
	select {
	case <-c.runDone:
	case <-ctx.Done():
		c.cancelWork()
		select {
		case <-c.runDone:
		case <-time.After(abortGrace):
			errs = append(errs, errors.New("consumer loop did not stop in time"))
		}
	}

	select {
	case <-c.runDone:
		if !waitGroup(ctx, &c.inflight) {
			c.log.Warn("shutdown timeout, aborting in-flight handlers")
			c.cancelWork()
			graceCtx, cancel := context.WithTimeout(context.Background(), abortGrace)
			if !waitGroup(graceCtx, &c.inflight) {
				errs = append(errs, errors.New("in-flight handlers did not finish"))
			}
			cancel()
		}
	default:
	}
	c.cancelWork()

	if ch != nil {
		c.closeChannel(ch)
	}
	c.log.Info("consumer stopped")
	return errors.Join(errs...)
}

func (c *Consumer) closeChannel(ch *amqp091.Channel) {
	if err := ch.Close(); err != nil && !errors.Is(err, amqp091.ErrClosed) {
		c.log.Warn("close consume channel", zap.Error(err))
	}
	c.mu.Lock()
	if c.ch == ch {
		c.ch = nil
	}
	c.mu.Unlock()
}

// waitGroup ждёт wg с ограничением по ctx. true — дождались.
func waitGroup(ctx context.Context, wg *sync.WaitGroup) bool {
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return true
	case <-ctx.Done():
		return false
	}
}
