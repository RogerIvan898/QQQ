// Команда chain-service — мост между ядром покер-рума и сетью TON:
//
//   - MODE=consumer: withdrawals → подпись → withdrawals.signed (для
//     Broadcaster) и приём подтверждений из withdrawals.result;
//   - MODE=watcher:  наблюдение за входящими переводами → deposits;
//   - MODE=broadcaster: withdrawals.signed → отправка в TON → withdrawals.result;
//   - MODE=all:      все режимы в независимых горутинах.
//
// `chain-service healthcheck` — проверка /readyz для HEALTHCHECK в Docker
// (в образе scratch нет curl/wget).
package main

import (
	"context"
	"database/sql"
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
	"gitlab.com/company-group7340831/poker/chain-service/internal/store"
	"gitlab.com/company-group7340831/poker/chain-service/internal/ton"
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

	// MySQL нужна подписи и broadcaster: история выводов и идемпотентность.
	var db *sql.DB
	if cfg.Mode.NeedsDB() {
		if db, err = store.Open(ctx, cfg.MySQLDSN, cfg.MySQLMaxOpenConns); err != nil {
			return fmt.Errorf("mysql: %w", err)
		}
		defer func() { _ = db.Close() }()
		log.Info("mysql connected, schema applied")
	}

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

	var idem amqp.IdempotencyStore
	if db != nil {
		s := store.NewIdempotency(db, cfg.IdempotencyTTL, log)
		go s.Run(ctx, cfg.IdempotencyCleanupInterval)
		idem = s
	} else {
		s := idempotency.NewMemoryStore(cfg.IdempotencyTTL)
		go s.Run(ctx, cfg.IdempotencyCleanupInterval, func(removed, left int) {
			log.Debug("idempotency cleanup", zap.Int("removed", removed), zap.Int("left", left))
		})
		idem = s
	}
	var repo *store.Withdrawals
	if db != nil {
		repo = store.NewWithdrawals(db)
	}
	results := handler.NewResultPublisher(pub, cfg.Exchange, cfg.QueueWithdrawalsResult)

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

	addConsumer := func(queue string, workers int, h amqp.Handler) {
		c := amqp.NewConsumer(amqp.ConsumerConfig{
			Queue:            queue,
			TagPrefix:        hostname,
			Prefetch:         cfg.PrefetchCount,
			Workers:          workers,
			MaxRetries:       cfg.MaxRetries,
			RetryQueues:      topology.Retry[queue],
			HandlerTimeout:   cfg.HandlerTimeout,
			ResubscribeDelay: cfg.ReconnectInitialDelay,
		}, client, pub, idem, h, log, m)
		consumers = append(consumers, c)
		start("consumer "+queue, c.Run)
	}

	if cfg.Mode.Consumes() {
		maxSeqno, err := repo.MaxSeqno(ctx)
		if err != nil {
			_ = client.Close()
			return fmt.Errorf("read max seqno: %w", err)
		}
		signer := handler.NewStubSigner(log, maxSeqno+1)
		withdrawals := handler.NewWithdrawalHandler(pub, signer, repo, cfg.Exchange, cfg.QueueWithdrawalsSigned, log)
		resultHandler := handler.NewResultHandler(handler.NewLogResultSink(log), m)
		addConsumer(cfg.QueueWithdrawals, cfg.Workers, withdrawals.Handle)
		addConsumer(cfg.QueueWithdrawalsResult, cfg.Workers, resultHandler.Handle)
	}

	if cfg.Mode.Broadcasts() {
		var tonClient ton.Client
		if cfg.TONClient == "stub" {
			log.Warn("STUB TON client is active: nothing is really sent to the network")
			tonClient = ton.Stub{}
		} else {
			if cfg.ToncenterAPIKey == "" {
				log.Warn("TONCENTER_API_KEY is empty: public rate limit applies")
			}
			tonClient = ton.NewToncenter(ton.ToncenterConfig{
				BaseURL: cfg.ToncenterURL,
				APIKey:  cfg.ToncenterAPIKey,
				RPS:     cfg.ToncenterRPS,
				Timeout: cfg.ToncenterTimeout,
			})
		}
		broadcaster := handler.NewBroadcastHandler(repo, tonClient, results, log)
		// Один воркер: кошелёк принимает seqno строго по порядку.
		addConsumer(cfg.QueueWithdrawalsSigned, 1, broadcaster.Handle)

		poller := handler.NewConfirmPoller(handler.ConfirmPollerConfig{
			Interval:  cfg.ConfirmPollInterval,
			Timeout:   cfg.ConfirmTimeout,
			BatchSize: cfg.ConfirmBatchSize,
		}, repo, tonClient, results, log)
		start("confirm poller", poller.Run)
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
// очереди с DLQ и биндингами к exchange, delay-очереди — для потребляемых.
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
			cfg.QueueWithdrawalsSigned: amqp.RetryQueues(cfg.QueueWithdrawalsSigned, cfg.RetryBaseDelay, cfg.MaxRetries),
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
