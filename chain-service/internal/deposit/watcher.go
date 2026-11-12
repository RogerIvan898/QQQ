// Package deposit — наблюдение за кошельком депозитов и публикация
// DEPOSIT_DETECTED.
package deposit

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
	"gitlab.com/company-group7340831/poker/chain-service/internal/events"
	"gitlab.com/company-group7340831/poker/chain-service/internal/schedule"
	"gitlab.com/company-group7340831/poker/chain-service/internal/ton"
)

// Таймауты одного обращения к хранилищу и к сети; пауза перед повторной
// загрузкой курсора.
const (
	queryTimeout     = 10 * time.Second
	networkTimeout   = 30 * time.Second
	cursorRetryDelay = 5 * time.Second
)

// Detected — событие о входящем переводе (очередь deposits).
//
// Схема депозитов: один кошелёк, пользователь указывает в комментарии свой
// код. Сопоставление comment → пользователь и зачисление делает ядро;
// перевод без комментария или с неизвестным кодом ядро отправляет на
// ручной разбор.
type Detected struct {
	TxHash      string    `json:"tx_hash"`
	LT          uint64    `json:"lt"` // logical time транзакции
	FromAddress string    `json:"from_address"`
	ToAddress   string    `json:"to_address"`
	Amount      string    `json:"amount"`      // десятичная строка, "50.5"
	AmountNano  uint64    `json:"amount_nano"` // то же в nanoton
	Asset       string    `json:"asset"`
	Comment     string    `json:"comment,omitempty"` // мемо
	TxTime      time.Time `json:"tx_time"`
	DetectedAt  time.Time `json:"detected_at"`
}

// Source — откуда читать транзакции кошелька (ton.Toncenter, ton.Stub).
type Source interface {
	DepositsSince(ctx context.Context, account string, afterLT uint64, limit int) (ton.DepositBatch, error)
}

// CursorStore хранит позицию наблюдателя (реализация — store.Cursors).
type CursorStore interface {
	Load(ctx context.Context, account string) (uint64, bool, error)
	Save(ctx context.Context, account string, lt uint64) error
}

// WatcherConfig — параметры наблюдателя.
type WatcherConfig struct {
	Account        string // адрес кошелька депозитов
	Exchange       string
	RoutingKey     string
	PollInterval   time.Duration
	BatchSize      int
	StartLT        uint64 // откуда начинать, если курсора в БД ещё нет
	PublishTimeout time.Duration
}

// Watcher опрашивает транзакции кошелька и публикует DEPOSIT_DETECTED.
//
// Гарантии:
//   - курсор (lt) двигается только после подтверждённой брокером публикации
//     всех депозитов пачки и сохраняется в БД — после рестарта наблюдатель
//     продолжает с того же места;
//   - при сбое событие публикуется повторно с тем же message_id (UUIDv5 от
//     tx_hash), и ядро отбрасывает дубль;
//   - запускать строго ОДИН экземпляр на кошелёк.
type Watcher struct {
	cfg     WatcherConfig
	source  Source
	cursors CursorStore
	pub     events.Publisher
	log     *zap.Logger
	now     func() time.Time

	lastLT  uint64
	unsaved bool // курсор сдвинут, но ещё не сохранён в БД
}

// NewWatcher создаёт наблюдатель.
func NewWatcher(cfg WatcherConfig, source Source, cursors CursorStore, pub events.Publisher, log *zap.Logger) *Watcher {
	return &Watcher{
		cfg: cfg, source: source, cursors: cursors, pub: pub,
		log: log.Named("deposit_watcher").With(zap.String("account", cfg.Account)),
		now: time.Now,
	}
}

// Run загружает курсор и опрашивает сеть каждые PollInterval до отмены ctx.
// Если пачка заполнена, следующая запрашивается сразу (догоняем историю).
func (w *Watcher) Run(ctx context.Context) error {
	if err := w.loadCursor(ctx); err != nil {
		return err
	}
	w.log.Info("deposit watcher started", zap.Duration("interval", w.cfg.PollInterval), zap.Uint64("from_lt", w.lastLT))

	schedule.Every(ctx, w.cfg.PollInterval, func() {
		for w.Poll(ctx) && ctx.Err() == nil {
		}
	})
	w.saveCursor(context.WithoutCancel(ctx))
	w.log.Info("deposit watcher stopped", zap.Uint64("last_lt", w.lastLT))
	return nil
}

func (w *Watcher) loadCursor(ctx context.Context) error {
	for {
		lctx, cancel := context.WithTimeout(ctx, queryTimeout)
		lt, ok, err := w.cursors.Load(lctx, w.cfg.Account)
		cancel()
		if err == nil {
			w.lastLT = w.cfg.StartLT
			if ok {
				w.lastLT = lt
			}
			return nil
		}
		w.log.Warn("load watcher cursor failed, retrying", zap.Error(err))
		if !schedule.Sleep(ctx, cursorRetryDelay) {
			return nil
		}
	}
}

// Poll — один запрос к сети. true — пачка была полной, стоит продолжить сразу.
func (w *Watcher) Poll(ctx context.Context) bool {
	fctx, cancel := context.WithTimeout(ctx, networkTimeout)
	batch, err := w.source.DepositsSince(fctx, w.cfg.Account, w.lastLT, w.cfg.BatchSize)
	cancel()
	if err != nil {
		if ctx.Err() == nil {
			w.log.Warn("fetch transactions failed", zap.Error(err))
		}
		return false
	}

	// Начатая пачка доводится до конца даже при остановке.
	work := context.WithoutCancel(ctx)
	for _, dep := range batch.Deposits {
		if err := w.publish(work, dep); err != nil {
			w.log.Error("publish deposit failed, will retry on next poll",
				zap.String("tx_hash", dep.TxHash), zap.Uint64("lt", dep.LT), zap.Error(err))
			w.saveCursor(work)
			return false
		}
		// Всё до этого депозита включительно просмотрено: при сбое на
		// следующем уже опубликованные не перечитываются.
		w.advance(dep.LT)
	}
	w.advance(batch.NextLT)
	w.saveCursor(work)
	return batch.Full
}

func (w *Watcher) advance(lt uint64) {
	if lt > w.lastLT {
		w.lastLT = lt
		w.unsaved = true
	}
}

func (w *Watcher) saveCursor(ctx context.Context) {
	if !w.unsaved {
		return
	}
	sctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	if err := w.cursors.Save(sctx, w.cfg.Account, w.lastLT); err != nil {
		// Курсор в памяти уже сдвинут; сохраним на следующем опросе.
		// После рестарта без сохранения события повторятся — ядро их отбросит.
		w.log.Warn("save watcher cursor failed", zap.Uint64("lt", w.lastLT), zap.Error(err))
		return
	}
	w.unsaved = false
}

func (w *Watcher) publish(ctx context.Context, d ton.Deposit) error {
	ev := Detected{
		TxHash:      d.TxHash,
		LT:          d.LT,
		FromAddress: d.FromAddress,
		ToAddress:   d.ToAddress,
		Amount:      ton.FormatNano(d.AmountNano),
		AmountNano:  d.AmountNano,
		Asset:       events.AssetTON,
		Comment:     d.Comment,
		TxTime:      time.Unix(d.Utime, 0).UTC(),
		DetectedAt:  w.now().UTC(),
	}
	body, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("marshal deposit: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, w.cfg.PublishTimeout)
	defer cancel()

	msgID := events.DeterministicID(events.DepositDetected, d.TxHash)
	if err := w.pub.Publish(ctx, amqp.Message{
		Exchange:      w.cfg.Exchange,
		RoutingKey:    w.cfg.RoutingKey,
		MessageID:     msgID,
		Type:          events.DepositDetected,
		CorrelationID: d.TxHash,
		Body:          body,
	}); err != nil {
		return err
	}
	w.log.Info("deposit published",
		zap.String("message_id", msgID),
		zap.String("tx_hash", d.TxHash),
		zap.Uint64("lt", d.LT),
		zap.String("amount", ev.Amount),
		zap.String("comment", d.Comment))
	return nil
}
