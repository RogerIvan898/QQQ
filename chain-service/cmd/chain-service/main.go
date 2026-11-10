// Команда chain-service — мост между сервисом подписи, ядром и сетью TON:
//
//   - broadcaster: withdrawals.signed (от сервиса подписи) → отправка в TON →
//     withdrawals.result (sent, затем confirmed / failed);
//   - watcher: входящие переводы на кошелёк депозитов → deposits.
//
// По умолчанию работают оба (MODE=all). Подписи здесь нет: ключи — только
// у сервиса подписи.
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
		zap.Int("max_retries", cfg.MaxRetries))

	// Первый SIGINT/SIGTERM запускает graceful shutdown; после stop()
	// повторный сигнал завершает процесс сразу (поведение Go по умолчанию).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	m := metrics.New()

	// MySQL: история выводов, ключи идемпотентности, курсор watcher.
	db, err := store.Open(ctx, cfg.MySQLDSN, cfg.MySQLMaxOpenConns)
	if err != nil {
		return fmt.Errorf("mysql: %w", err)
	}
	defer func() { _ = db.Close() }()
	log.Info("mysql connected, schema applied")

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

	idem := store.NewIdempotency(db, cfg.IdempotencyTTL, log)
	go idem.Run(ctx, cfg.IdempotencyCleanupInterval)
	repo := store.NewWithdrawals(db)
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

	// Один клиент TON на процесс: лимит запросов toncenter общий для
	// broadcaster и watcher.
	var tonClient ton.Network
	if cfg.Mode.UsesTON() {
		if cfg.TONClient == "stub" {
			log.Warn("STUB TON client is active: nothing is really sent to or read from the network")
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
	}

	if cfg.Mode.Broadcasts() {
		broadcaster := handler.NewBroadcastHandler(repo, tonClient, results, log)
		// Строгий порядок seqno: prefetch 1, один воркер, без таймаута —
		// временные ошибки обработчик повторяет на месте, не пропуская
		// следующий seqno вперёд.
		c := amqp.NewConsumer(amqp.ConsumerConfig{
			Queue:            cfg.QueueWithdrawalsSigned,
			TagPrefix:        hostname,
			Prefetch:         1,
			Workers:          1,
			MaxRetries:       cfg.MaxRetries,
			RetryQueues:      topology.Retry[cfg.QueueWithdrawalsSigned],
			HandlerTimeout:   0,
			ResubscribeDelay: cfg.ReconnectInitialDelay,
		}, client, pub, idem, broadcaster.Handle, log, m)
		consumers = append(consumers, c)
		start("consumer "+cfg.QueueWithdrawalsSigned, c.Run)

		poller := handler.NewConfirmPoller(handler.ConfirmPollerConfig{
			Account:   cfg.WalletAddress,
			ScanLimit: cfg.ConfirmScanLimit,
			Interval:  cfg.ConfirmPollInterval,
			Timeout:   cfg.ConfirmTimeout,
			BatchSize: cfg.ConfirmBatchSize,
		}, repo, tonClient, results, log)
		start("confirm poller", poller.Run)
	}

	if cfg.Mode.Watches() {
		watcher := handler.NewDepositWatcher(handler.DepositWatcherConfig{
			Account:        cfg.DepositAddress,
			Exchange:       cfg.Exchange,
			RoutingKey:     cfg.QueueDeposits,
			PollInterval:   cfg.WatcherPollInterval,
			BatchSize:      cfg.WatcherBatchSize,
			StartLT:        cfg.WatcherStartLT,
			PublishTimeout: cfg.PublishTimeout,
		}, tonClient, store.NewCursors(db), pub, log)
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

// buildTopology собирает топологию брокера: очереди сервиса с DLQ и
// биндингами к exchange; delay-очереди — для потребляемой withdrawals.signed.
func buildTopology(cfg *config.Config) amqp.Topology {
	return amqp.Topology{
		Exchange:     cfg.Exchange,
		ExchangeType: cfg.ExchangeType,
		QueueType:    cfg.QueueType,
		Queues: []string{
			cfg.QueueWithdrawalsSigned,
			cfg.QueueWithdrawalsResult,
			cfg.QueueDeposits,
		},
		Retry: map[string][]amqp.RetryQueue{
			cfg.QueueWithdrawalsSigned: amqp.RetryQueues(cfg.QueueWithdrawalsSigned, cfg.RetryBaseDelay, cfg.MaxRetries),
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
