package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
)

// DepositDetected — событие о входящем переводе (очередь deposits).
type DepositDetected struct {
	TxHash      string    `json:"tx_hash"`
	LT          uint64    `json:"lt"` // logical time транзакции — курсор наблюдателя
	FromAddress string    `json:"from_address"`
	ToAddress   string    `json:"to_address"`
	Amount      string    `json:"amount"` // десятичная строка
	Asset       string    `json:"asset"`
	Comment     string    `json:"comment,omitempty"` // memo: по нему ядро находит пользователя
	DetectedAt  time.Time `json:"detected_at"`
}

// TONClient — источник входящих транзакций горячего кошелька.
type TONClient interface {
	// DepositsSince возвращает до limit входящих переводов с LT > afterLT,
	// отсортированных по возрастанию LT.
	DepositsSince(ctx context.Context, afterLT uint64, limit int) ([]DepositDetected, error)
}

// StubTONClient — ЗАГЛУШКА: всегда возвращает пустой список.
//
// Продакшен-реализация: tonutils-go / toncenter API v3 — ListTransactions
// по адресу горячего кошелька, фильтр входящих внутренних сообщений,
// ожидание нужного числа подтверждений (masterchain блоков) перед выдачей.
type StubTONClient struct{}

// DepositsSince ничего не находит.
func (StubTONClient) DepositsSince(context.Context, uint64, int) ([]DepositDetected, error) {
	return nil, nil
}

// DepositWatcherConfig — параметры наблюдателя.
type DepositWatcherConfig struct {
	Exchange       string
	RoutingKey     string
	PollInterval   time.Duration
	BatchSize      int
	StartLT        uint64
	PublishTimeout time.Duration
}

// DepositWatcher опрашивает TON и публикует DEPOSIT_DETECTED.
//
// Курсор (последний опубликованный LT) двигается только после
// подтверждённой брокером публикации, поэтому при сбое событие будет
// опубликовано повторно — с тем же детерминированным message_id (от
// tx_hash), и получатель отбросит дубль. В MVP курсор живёт в памяти и
// при рестарте начинается с WATCHER_START_LT; в продакшене его нужно
// хранить в БД.
type DepositWatcher struct {
	cfg    DepositWatcherConfig
	ton    TONClient
	pub    Publisher
	log    *zap.Logger
	lastLT uint64
}

// NewDepositWatcher создаёт наблюдатель.
func NewDepositWatcher(cfg DepositWatcherConfig, ton TONClient, pub Publisher, log *zap.Logger) *DepositWatcher {
	return &DepositWatcher{cfg: cfg, ton: ton, pub: pub, log: log.Named("deposit_watcher"), lastLT: cfg.StartLT}
}

// Run опрашивает сеть каждые PollInterval до отмены ctx. Текущая пачка
// при остановке дорабатывается до конца (публикации не обрываются на
// полпути), новые не начинаются.
func (w *DepositWatcher) Run(ctx context.Context) error {
	w.log.Info("deposit watcher started",
		zap.Duration("interval", w.cfg.PollInterval),
		zap.Uint64("start_lt", w.lastLT))

	t := time.NewTicker(w.cfg.PollInterval)
	defer t.Stop()
	for {
		w.poll(ctx)
		select {
		case <-ctx.Done():
			w.log.Info("deposit watcher stopped", zap.Uint64("last_lt", w.lastLT))
			return nil
		case <-t.C:
		}
	}
}

func (w *DepositWatcher) poll(ctx context.Context) {
	deposits, err := w.ton.DepositsSince(ctx, w.lastLT, w.cfg.BatchSize)
	if err != nil {
		if ctx.Err() == nil {
			w.log.Warn("fetch deposits failed", zap.Error(err))
		}
		return
	}

	// Публикации не привязаны к отмене ctx: начатая пачка доводится до
	// конца, каждая публикация ограничена своим таймаутом.
	pubCtx := context.WithoutCancel(ctx)
	for _, dep := range deposits {
		if ctx.Err() != nil {
			return
		}
		if err := w.publish(pubCtx, dep); err != nil {
			w.log.Error("publish deposit failed, will retry on next poll",
				zap.String("tx_hash", dep.TxHash), zap.Uint64("lt", dep.LT), zap.Error(err))
			return
		}
		if dep.LT > w.lastLT {
			w.lastLT = dep.LT
		}
	}
}

func (w *DepositWatcher) publish(ctx context.Context, dep DepositDetected) error {
	if dep.DetectedAt.IsZero() {
		dep.DetectedAt = time.Now().UTC()
	}
	body, err := json.Marshal(dep)
	if err != nil {
		return fmt.Errorf("marshal deposit: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, w.cfg.PublishTimeout)
	defer cancel()

	msgID := DeterministicID(EventDepositDetected, dep.TxHash)
	if err := w.pub.Publish(ctx, amqp.Message{
		Exchange:      w.cfg.Exchange,
		RoutingKey:    w.cfg.RoutingKey,
		MessageID:     msgID,
		Type:          EventDepositDetected,
		CorrelationID: dep.TxHash,
		Body:          body,
	}); err != nil {
		return err
	}
	w.log.Info("deposit published",
		zap.String("message_id", msgID),
		zap.String("tx_hash", dep.TxHash),
		zap.Uint64("lt", dep.LT),
		zap.String("amount", dep.Amount),
		zap.String("asset", dep.Asset))
	return nil
}
