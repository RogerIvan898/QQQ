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
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"gitlab.com/company-group7340831/poker/chain-service/internal/app"
	"gitlab.com/company-group7340831/poker/chain-service/internal/config"
)

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

	// Первый SIGINT/SIGTERM запускает graceful shutdown; после stop()
	// повторный сигнал завершает процесс сразу (поведение Go по умолчанию).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		stop()
	}()

	return app.Run(ctx, cfg, log)
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
	zc.InitialFields = map[string]any{"service": app.ID, "mode": string(cfg.Mode)}
	return zc.Build()
}

// healthcheck опрашивает /readyz локального процесса. Код выхода 0 — готов.
func healthcheck() int {
	port := os.Getenv("METRICS_PORT")
	if port == "" {
		port = "9090"
	}
	host := os.Getenv("METRICS_HOST")
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + net.JoinHostPort(host, port) + "/readyz")
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
