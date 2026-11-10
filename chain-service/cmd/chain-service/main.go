// Команда chain-service — мост между ядром покер-рума и сетью TON:
//
//   - MODE=consumer: withdrawals → подпись → withdrawals.signed (для
//     Broadcaster) и приём подтверждений из withdrawals.result;
//   - MODE=watcher:  наблюдение за входящими переводами → deposits;
//   - MODE=all:      оба режима в независимых горутинах.
//
// `chain-service healthcheck` — проверка /readyz для HEALTHCHECK в Docker
// (в образе scratch нет curl/wget).
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
	"gitlab.com/company-group7340831/poker/chain-service/internal/config"
	"gitlab.com/company-group7340831/poker/chain-service/internal/handler"
	"gitlab.com/company-group7340831/poker/chain-service/internal/idempotency"
	"gitlab.com/company-group7340831/poker/chain-service/internal/metrics"
)

const appID = "chain-service"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "chain-service:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config:\n%w", err)
	}

	log, err := newLogger(cfg)
	if err != nil {
		return fmt.Errorf("logger: %w", err)
	}
	defer func() { _ = log.Sync() }()

	hostname, _ := os.Hostname()
	log.Info("starting chain-service",
		zap.String("rabbitmq_url", cfg.RedactedRabbitURL()),
		zap.String("exchange", cfg.Exchange),
		zap.Int("prefetch", cfg.PrefetchCount),
		zap.Int("max_retries", cfg.MaxRetries))

	// Первый SIGINT/SIGTERM запускает graceful shutdown; после stop()
	// повторный сигнал завершает процесс сразу (поведение Go по умолчанию).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	m := metrics.New()

	topology := buildTopology(cfg)
	client := amqp.NewClient(amqp.ClientConfig{
		URL:                   cfg.RabbitURL,
		ConnectionName:        fmt.Sprintf("%s-%s-%s", appID, cfg.Mode, hostname),
		Heartbeat:             cfg.Heartbeat,
		ReconnectInitialDelay: cfg.ReconnectInitialDelay,
		ReconnectMaxDelay:     cfg.ReconnectMaxDelay,
		Topology:              topology,
	}, log, m)
	client.Start()

	// Канал фатальных ошибок фоновых компонентов → остановка сервиса.
	errCh := make(chan error, 8)

	httpSrv := metrics.NewServer(cfg.MetricsAddr(), m, client.IsConnected, log)
	if err := httpSrv.Start(errCh); err != nil {
		_ = client.Close()
		return fmt.Errorf("metrics server: %w", err)
	}

	pub := amqp.NewPublisher(client, amqp.PublisherConfig{
		AppID:          appID,
		ConfirmTimeout: cfg.PublishTimeout,
	}, log, m)

	idem := idempotency.NewMemoryStore(cfg.IdempotencyTTL)
	go idem.Run(ctx, cfg.IdempotencyCleanupInterval, func(removed, left int) {
		log.Debug("idempotency cleanup", zap.Int("removed", removed), zap.Int("left", left))
	})

	var (
		workers   sync.WaitGroup
		consumers []*amqp.Consumer
	)
	start := func(name string, fn func(context.Context) error) {
		workers.Add(1)
		go func() {
			defer workers.Done()
			if err := fn(ctx); err != nil {
				errCh <- fmt.Errorf("%s: %w", name, err)
			}
		}()
	}

	if cfg.Mode.Consumes() {
		signer := handler.NewStubSigner(log)
		withdrawals := handler.NewWithdrawalHandler(pub, signer, cfg.Exchange, cfg.QueueWithdrawalsSigned, log)
		results := handler.NewResultHandler(handler.NewLogResultSink(log), m)

		for _, q := range []struct {
			queue string
			h     amqp.Handler
		}{
			{cfg.QueueWithdrawals, withdrawals.Handle},
			{cfg.QueueWithdrawalsResult, results.Handle},
		} {
			c := amqp.NewConsumer(amqp.ConsumerConfig{
				Queue:            q.queue,
				TagPrefix:        hostname,
				Prefetch:         cfg.PrefetchCount,
				Workers:          cfg.Workers,
				MaxRetries:       cfg.MaxRetries,
				RetryQueues:      topology.Retry[q.queue],
				HandlerTimeout:   cfg.HandlerTimeout,
				ResubscribeDelay: cfg.ReconnectInitialDelay,
			}, client, pub, idem, q.h, log, m)
			consumers = append(consumers, c)
			start("consumer "+q.queue, c.Run)
		}
	}

	if cfg.Mode.Watches() {
		watcher := handler.NewDepositWatcher(handler.DepositWatcherConfig{
			Exchange:       cfg.Exchange,
			RoutingKey:     cfg.QueueDeposits,
			PollInterval:   cfg.WatcherPollInterval,
			BatchSize:      cfg.WatcherBatchSize,
			StartLT:        cfg.WatcherStartLT,
			PublishTimeout: cfg.PublishTimeout,
		}, handler.StubTONClient{}, pub, log)
		start("deposit watcher", watcher.Run)
	}

	log.Info("chain-service started", zap.String("metrics_addr", cfg.MetricsAddr()))

	var runErr error
	select {
	case <-ctx.Done():
		log.Info("shutdown signal received")
	case runErr = <-errCh:
		log.Error("fatal component error, shutting down", zap.Error(runErr))
	}
	stop()

	return shutdown(cfg, log, consumers, &workers, pub, client, httpSrv, runErr)
}

// shutdown останавливает компоненты в порядке зависимостей:
// консьюмеры (cancel + ожидание in-flight) → наблюдатель → паблишер →
// соединение → HTTP. Всё укладывается в SHUTDOWN_TIMEOUT.
func shutdown(cfg *config.Config, log *zap.Logger, consumers []*amqp.Consumer, workers *sync.WaitGroup,
	pub *amqp.Publisher, client *amqp.Client, httpSrv *metrics.Server, runErr error) error {

	ctx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()

	errs := []error{runErr}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, c := range consumers {
		wg.Add(1)
		go func(c *amqp.Consumer) {
			defer wg.Done()
			if err := c.Shutdown(ctx); err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
			}
		}(c)
	}
	wg.Wait()

	done := make(chan struct{})
	go func() { workers.Wait(); close(done) }()
	select {
	case <-done:
	case <-ctx.Done():
		log.Warn("background workers did not stop before shutdown timeout")
	}

	if err := pub.Close(); err != nil {
		errs = append(errs, fmt.Errorf("close publisher: %w", err))
	}
	if err := client.Close(); err != nil {
		errs = append(errs, fmt.Errorf("close connection: %w", err))
	}

	httpCtx, httpCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer httpCancel()
	if err := httpSrv.Shutdown(httpCtx); err != nil {
		errs = append(errs, fmt.Errorf("metrics server: %w", err))
	}

	err := errors.Join(errs...)
	if err != nil {
		log.Error("shutdown finished with errors", zap.Error(err))
	} else {
		log.Info("shutdown complete")
	}
	return err
}

// buildTopology собирает топологию брокера из конфигурации: все четыре
// очереди с DLQ и биндингами к exchange, delay-очереди — только для
// очередей, которые этот сервис потребляет.
func buildTopology(cfg *config.Config) amqp.Topology {
	return amqp.Topology{
		Exchange:     cfg.Exchange,
		ExchangeType: cfg.ExchangeType,
		QueueType:    cfg.QueueType,
		Queues: []string{
			cfg.QueueWithdrawals,
			cfg.QueueWithdrawalsSigned,
			cfg.QueueWithdrawalsResult,
			cfg.QueueDeposits,
		},
		Retry: map[string][]amqp.RetryQueue{
			cfg.QueueWithdrawals:       amqp.RetryQueues(cfg.QueueWithdrawals, cfg.RetryBaseDelay, cfg.MaxRetries),
			cfg.QueueWithdrawalsResult: amqp.RetryQueues(cfg.QueueWithdrawalsResult, cfg.RetryBaseDelay, cfg.MaxRetries),
		},
	}
}

// newLogger — zap в JSON с ISO8601-временем.
func newLogger(cfg *config.Config) (*zap.Logger, error) {
	level, err := zapcore.ParseLevel(cfg.LogLevel)
	if err != nil {
		return nil, err
	}
	zc := zap.NewProductionConfig()
	zc.Level = zap.NewAtomicLevelAt(level)
	zc.Encoding = "json"
	zc.EncoderConfig.TimeKey = "ts"
	zc.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	zc.InitialFields = map[string]any{"service": appID, "mode": string(cfg.Mode)}
	return zc.Build()
}

// healthcheck опрашивает /readyz локального процесса. Код выхода 0 — готов.
func healthcheck() int {
	port := os.Getenv("METRICS_PORT")
	if port == "" {
		port = "9090"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/readyz")
	if err != nil {
		fmt.Fprintln(os.Stderr, "healthcheck:", err)
		return 1
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		fmt.Fprintln(os.Stderr, "healthcheck: status", resp.StatusCode)
		return 1
	}
	return 0
}
