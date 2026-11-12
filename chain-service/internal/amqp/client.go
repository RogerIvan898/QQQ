// Package amqp — надёжная обвязка над github.com/rabbitmq/amqp091-go:
// соединение с автопереподключением и восстановлением топологии,
// паблишер с publisher confirms и консьюмер с ручным ack, повторами
// через delay-очереди и DLQ.
package amqp

import (
	"context"
	"fmt"
	"sync"
	"time"

	amqp091 "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/metrics"
)

// DLQSuffix — суффикс dead-letter очереди: для очереди X это X.dlq.
const DLQSuffix = ".dlq"

// dialTimeout — таймаут TCP+TLS при подключении к брокеру.
const dialTimeout = 10 * time.Second

// RetryQueue — delay-очередь для одной попытки повтора. Сообщение лежит в
// ней Delay (x-message-ttl), после чего RabbitMQ dead-letter'ит его обратно
// в основную очередь.
type RetryQueue struct {
	Name  string
	Delay time.Duration
}

// RetryQueues строит delay-очереди для queue с экспоненциальной задержкой:
// base, 2·base, 4·base, … (по одной очереди на попытку).
//
// Почему отдельная очередь на попытку, а не одна очередь с per-message TTL:
// RabbitMQ снимает просроченные сообщения только с головы очереди, и
// сообщение с короткой задержкой застряло бы за сообщением с длинной.
// В очереди с фиксированным x-message-ttl такой проблемы нет.
//
// Задержка входит в имя (withdrawals.retry.5s): если поменять
// RETRY_BASE_DELAY, сервис объявит новые очереди вместо падения на
// PRECONDITION_FAILED из-за несовпадения аргументов старых.
func RetryQueues(queue string, base time.Duration, maxRetries int) []RetryQueue {
	out := make([]RetryQueue, 0, maxRetries)
	for i := 0; i < maxRetries; i++ {
		d := base << i
		out = append(out, RetryQueue{Name: fmt.Sprintf("%s.retry.%s", queue, d), Delay: d})
	}
	return out
}

// Topology — всё, что сервис объявляет в брокере после каждого подключения.
type Topology struct {
	Exchange     string // core.events
	ExchangeType string // direct | topic
	QueueType    string // quorum | classic
	// Queues — основные очереди. Каждая получает DLQ (X.dlq) и биндится
	// к Exchange с routing key, равным имени очереди.
	Queues []string
	// Retry — delay-очереди для потребляемых очередей.
	Retry map[string][]RetryQueue
	// SingleActive — очереди с x-single-active-consumer: сообщения получает
	// только один подписчик, остальные ждут в резерве. Так второй экземпляр
	// сервиса не нарушит порядок seqno. Аргумент нельзя поменять у уже
	// созданной очереди — её нужно пересоздать.
	SingleActive map[string]bool
}

// ClientConfig — параметры соединения.
type ClientConfig struct {
	URL                   string
	ConnectionName        string // видно в RabbitMQ management UI
	Heartbeat             time.Duration
	ReconnectInitialDelay time.Duration
	ReconnectMaxDelay     time.Duration
	Topology              Topology
}

// Client владеет единственным AMQP-соединением процесса.
//
// Соединение защищено мьютексом и подменяется горутиной handleReconnect
// при обрыве. Паблишер и консьюмеры не хранят соединение сами: они
// запрашивают его через Connection(ctx) и открывают на нём собственные
// каналы (publish и consume раздельно).
type Client struct {
	cfg ClientConfig
	log *zap.Logger
	m   *metrics.Metrics

	mu      sync.RWMutex
	conn    *amqp091.Connection
	ready   chan struct{} // закрывается, когда conn готов; пересоздаётся при обрыве
	closed  bool
	started bool

	cancel context.CancelFunc
	done   chan struct{} // закрывается при выходе handleReconnect
}

// NewClient создаёт клиента. Подключение начинается после Start.
func NewClient(cfg ClientConfig, log *zap.Logger, m *metrics.Metrics) *Client {
	return &Client{
		cfg:    cfg,
		log:    log.Named("amqp"),
		m:      m,
		ready:  make(chan struct{}),
		cancel: func() {},
		done:   make(chan struct{}),
	}
}

// Start запускает фоновую горутину подключения/переподключения.
// Её жизненный цикл не привязан к сигналам: во время graceful shutdown
// соединение должно жить, пока in-flight обработчики делают ack и publish.
// Останавливается она только через Close.
func (c *Client) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.mu.Lock()
	c.cancel = cancel
	c.started = true
	c.mu.Unlock()
	go c.handleReconnect(ctx)
}

// Connection возвращает живое соединение, при необходимости дожидаясь
// переподключения. Ожидание ограничено ctx.
func (c *Client) Connection(ctx context.Context) (*amqp091.Connection, error) {
	for {
		c.mu.RLock()
		conn, ready, closed := c.conn, c.ready, c.closed
		c.mu.RUnlock()

		if closed {
			return nil, ErrClientClosed
		}
		if conn != nil {
			if !conn.IsClosed() {
				return conn, nil
			}
			// Соединение уже умерло, но handleReconnect ещё не успел
			// его убрать — короткая пауза вместо холостого цикла.
			if err := sleepCtx(ctx, 50*time.Millisecond); err != nil {
				return nil, err
			}
			continue
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-c.done:
			return nil, ErrClientClosed
		case <-ready:
		}
	}
}

// IsConnected — для readiness-проверки.
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.conn != nil && !c.conn.IsClosed()
}

// Close останавливает переподключение и закрывает соединение.
// Вызывать после того, как паблишер и консьюмеры закрыли свои каналы.
func (c *Client) Close() error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil
	}
	c.closed = true
	conn := c.conn
	c.conn = nil
	cancel, started := c.cancel, c.started
	c.mu.Unlock()

	cancel()

	var err error
	if conn != nil && !conn.IsClosed() {
		err = conn.Close()
	}
	if started {
		// handleReconnect может быть посреди dial — не ждём дольше разумного.
		select {
		case <-c.done:
		case <-time.After(dialTimeout):
			c.log.Warn("reconnect loop did not stop in time")
		}
	}

	c.m.ConnectionUp.Set(0)
	c.log.Info("rabbitmq connection closed")
	return err
}

// handleReconnect держит соединение: подключается, объявляет топологию,
// слушает conn.NotifyClose() и при обрыве переподключается с
// экспоненциальной задержкой 1s → 2s → 4s → … → RECONNECT_MAX_DELAY.
func (c *Client) handleReconnect(ctx context.Context) {
	defer close(c.done)

	backoff := c.cfg.ReconnectInitialDelay
	for {
		if ctx.Err() != nil {
			return
		}

		conn, err := c.connect()
		if err != nil {
			c.m.ConnectionUp.Set(0)
			c.log.Error("rabbitmq connect failed",
				zap.Error(err), zap.Duration("retry_in", backoff))
			if sleepCtx(ctx, backoff) != nil {
				return
			}
			backoff = nextBackoff(backoff, c.cfg.ReconnectMaxDelay)
			continue
		}
		backoff = c.cfg.ReconnectInitialDelay

		// Подписки регистрируются до публикации соединения: если оно уже
		// успело закрыться, amqp091 сразу закроет и эти каналы.
		closeCh := conn.NotifyClose(make(chan *amqp091.Error, 1))
		blockedCh := conn.NotifyBlocked(make(chan amqp091.Blocking, 1))

		c.setConnection(conn)
		c.m.ConnectionUp.Set(1)
		c.log.Info("rabbitmq connected", zap.String("connection_name", c.cfg.ConnectionName))

		if !c.watch(ctx, conn, closeCh, blockedCh) {
			return
		}
	}
}

// watch ждёт обрыва соединения. Возвращает false, если пора выходить.
func (c *Client) watch(ctx context.Context, conn *amqp091.Connection, closeCh <-chan *amqp091.Error, blockedCh <-chan amqp091.Blocking) bool {
	for {
		select {
		case <-ctx.Done():
			// Соединение закроет Close().
			return false

		case b, ok := <-blockedCh:
			if !ok {
				blockedCh = nil
				continue
			}
			// Брокер приостановил приём публикаций (resource alarm:
			// память/диск). Публикации будут упираться в таймаут confirm.
			if b.Active {
				c.log.Warn("rabbitmq blocked connection", zap.String("reason", b.Reason))
			} else {
				c.log.Info("rabbitmq unblocked connection")
			}

		case amqpErr, ok := <-closeCh:
			c.clearConnection(conn)
			c.m.ConnectionUp.Set(0)
			if ctx.Err() != nil {
				return false
			}
			c.m.ReconnectTotal.Inc()
			if ok && amqpErr != nil {
				c.log.Warn("rabbitmq connection lost, reconnecting",
					zap.Int("code", amqpErr.Code),
					zap.String("reason", amqpErr.Reason),
					zap.Bool("server", amqpErr.Server))
			} else {
				c.log.Warn("rabbitmq connection closed, reconnecting")
			}
			return true
		}
	}
}

// connect устанавливает соединение и объявляет топологию на временном канале.
func (c *Client) connect() (*amqp091.Connection, error) {
	props := amqp091.NewConnectionProperties()
	props.SetClientConnectionName(c.cfg.ConnectionName)

	conn, err := amqp091.DialConfig(c.cfg.URL, amqp091.Config{
		Heartbeat:  c.cfg.Heartbeat,
		Locale:     "en_US",
		Properties: props,
		Dial:       amqp091.DefaultDial(dialTimeout),
	})
	if err != nil {
		return nil, fmt.Errorf("dial: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("open topology channel: %w", err)
	}
	if err := declareTopology(ch, c.cfg.Topology); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("declare topology: %w", err)
	}
	if err := ch.Close(); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("close topology channel: %w", err)
	}
	c.log.Info("rabbitmq topology declared",
		zap.String("exchange", c.cfg.Topology.Exchange),
		zap.Strings("queues", c.cfg.Topology.Queues))
	return conn, nil
}

func (c *Client) setConnection(conn *amqp091.Connection) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		// Close() успел отработать, пока мы подключались.
		_ = conn.Close()
		return
	}
	c.conn = conn
	close(c.ready)
}

func (c *Client) clearConnection(conn *amqp091.Connection) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == conn {
		c.conn = nil
		c.ready = make(chan struct{})
	}
}

// declareTopology объявляет exchange, очереди с DLQ, биндинги и
// delay-очереди. Операции идемпотентны: повторное объявление с теми же
// аргументами ничего не меняет, поэтому вызывается после каждого
// переподключения.
func declareTopology(ch *amqp091.Channel, t Topology) error {
	if err := ch.ExchangeDeclare(t.Exchange, t.ExchangeType,
		true,  // durable
		false, // autoDelete
		false, // internal
		false, // noWait
		nil,
	); err != nil {
		return fmt.Errorf("exchange %q: %w", t.Exchange, err)
	}

	for _, q := range t.Queues {
		if err := declareQueueWithDLQ(ch, q, t.QueueType, t.SingleActive[q]); err != nil {
			return err
		}
		if err := ch.QueueBind(q, q, t.Exchange, false, nil); err != nil {
			return fmt.Errorf("bind %q → %q: %w", t.Exchange, q, err)
		}
	}

	for target, retries := range t.Retry {
		for _, rq := range retries {
			if err := declareRetryQueue(ch, rq, target, t.QueueType); err != nil {
				return err
			}
		}
	}
	return nil
}

// declareQueueWithDLQ объявляет queueName.dlq и основную очередь
// queueName с x-dead-letter-exchange: "" и
// x-dead-letter-routing-key: queueName + ".dlq". Тогда
// msg.Nack(false, false) по основной очереди отправляет сообщение в DLQ.
func declareQueueWithDLQ(ch *amqp091.Channel, queueName, queueType string, singleActive bool) error {
	dlq := queueName + DLQSuffix
	if _, err := ch.QueueDeclare(dlq, true, false, false, false, queueArgs(queueType, nil)); err != nil {
		return fmt.Errorf("queue %q: %w", dlq, err)
	}

	args := amqp091.Table{
		"x-dead-letter-exchange":    "",
		"x-dead-letter-routing-key": dlq,
	}
	if singleActive {
		args["x-single-active-consumer"] = true
	}
	if queueType == "quorum" {
		// Для quorum-очередей dead-lettering по умолчанию at-most-once:
		// при сбое во время перекладки сообщение может потеряться. Для
		// денежных операций включаем at-least-once (требует reject-publish).
		args["x-dead-letter-strategy"] = "at-least-once"
		args["x-overflow"] = "reject-publish"
	}
	if _, err := ch.QueueDeclare(queueName, true, false, false, false, queueArgs(queueType, args)); err != nil {
		return fmt.Errorf("queue %q: %w", queueName, err)
	}
	return nil
}

// declareRetryQueue объявляет delay-очередь: без консьюмеров, с
// фиксированным TTL; по истечении TTL сообщение возвращается в target.
func declareRetryQueue(ch *amqp091.Channel, rq RetryQueue, target, queueType string) error {
	args := amqp091.Table{
		"x-message-ttl":             rq.Delay.Milliseconds(),
		"x-dead-letter-exchange":    "",
		"x-dead-letter-routing-key": target,
	}
	if queueType == "quorum" {
		args["x-dead-letter-strategy"] = "at-least-once"
		args["x-overflow"] = "reject-publish"
	}
	if _, err := ch.QueueDeclare(rq.Name, true, false, false, false, queueArgs(queueType, args)); err != nil {
		return fmt.Errorf("retry queue %q: %w", rq.Name, err)
	}
	return nil
}

func queueArgs(queueType string, extra amqp091.Table) amqp091.Table {
	args := amqp091.Table{"x-queue-type": queueType}
	for k, v := range extra {
		args[k] = v
	}
	return args
}

func nextBackoff(cur, max time.Duration) time.Duration {
	next := cur * 2
	if next > max || next <= 0 {
		return max
	}
	return next
}

// sleepCtx — пауза, прерываемая отменой контекста.
func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
