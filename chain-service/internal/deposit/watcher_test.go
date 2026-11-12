package deposit

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
	"gitlab.com/company-group7340831/poker/chain-service/internal/events"
	"gitlab.com/company-group7340831/poker/chain-service/internal/ton"
)

// fakePublisher запоминает опубликованные сообщения.
type fakePublisher struct {
	msgs []amqp.Message
	err  error
}

func (f *fakePublisher) Publish(_ context.Context, m amqp.Message) error {
	if f.err != nil {
		return f.err
	}
	f.msgs = append(f.msgs, m)
	return nil
}

// MemoryCursors — CursorStore в памяти (для тестов).
type MemoryCursors struct {
	mu sync.Mutex
	m  map[string]uint64
}

// NewMemoryCursors создаёт курсоры в памяти.
func NewMemoryCursors() *MemoryCursors { return &MemoryCursors{m: map[string]uint64{}} }

// Load возвращает курсор.
func (c *MemoryCursors) Load(_ context.Context, account string) (uint64, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.m[account]
	return v, ok, nil
}

// Save сохраняет курсор (только вперёд).
func (c *MemoryCursors) Save(_ context.Context, account string, lt uint64) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if lt > c.m[account] {
		c.m[account] = lt
	}
	return nil
}

type fakeSource struct {
	batch  ton.DepositBatch
	err    error
	called []uint64 // afterLT каждого вызова
}

func (f *fakeSource) DepositsSince(_ context.Context, _ string, afterLT uint64, _ int) (ton.DepositBatch, error) {
	f.called = append(f.called, afterLT)
	return f.batch, f.err
}

// flakyPublisher падает на N-й публикации.
type flakyPublisher struct {
	fakePublisher
	failAt int
	n      int
}

func (f *flakyPublisher) Publish(ctx context.Context, m amqp.Message) error {
	f.n++
	if f.n == f.failAt {
		return amqp.ErrPublishTimeout
	}
	return f.fakePublisher.Publish(ctx, m)
}

func newWatcher(src Source, cur CursorStore, pub events.Publisher) *Watcher {
	return NewWatcher(WatcherConfig{
		Account: "EQwallet", Exchange: "ex", RoutingKey: "deposits",
		PollInterval: time.Second, BatchSize: 10, StartLT: 100, PublishTimeout: time.Second,
	}, src, cur, pub, zap.NewNop())
}

var twoDeposits = ton.DepositBatch{
	Deposits: []ton.Deposit{
		{TxHash: "a", LT: 101, AmountNano: 1_500_000_000, Comment: "user-1", Utime: 1700000000},
		{TxHash: "b", LT: 104, AmountNano: 2_000_000_000},
	},
	NextLT: 110,
}

func TestDepositWatcherPublishesAndSavesCursor(t *testing.T) {
	ctx := context.Background()
	src, cur, pub := &fakeSource{batch: twoDeposits}, NewMemoryCursors(), &fakePublisher{}
	w := newWatcher(src, cur, pub)
	if err := w.loadCursor(ctx); err != nil {
		t.Fatal(err)
	}

	w.Poll(ctx)
	if len(pub.msgs) != 2 {
		t.Fatalf("published %d, want 2", len(pub.msgs))
	}
	var ev Detected
	_ = json.Unmarshal(pub.msgs[0].Body, &ev)
	if ev.Amount != "1.5" || ev.AmountNano != 1_500_000_000 || ev.Comment != "user-1" || ev.Asset != events.AssetTON || ev.LT != 101 {
		t.Errorf("unexpected event %+v", ev)
	}
	if pub.msgs[0].MessageID != events.DeterministicID(events.DepositDetected, "a") {
		t.Error("message_id must be derived from tx_hash")
	}
	if lt, ok, _ := cur.Load(ctx, "EQwallet"); !ok || lt != 110 {
		t.Errorf("cursor = %d (%v), want 110", lt, ok)
	}

	// Новый watcher (рестарт) продолжает с сохранённого курсора.
	w2 := newWatcher(src, cur, pub)
	_ = w2.loadCursor(ctx)
	w2.Poll(ctx)
	if got := src.called[len(src.called)-1]; got != 110 {
		t.Errorf("after restart fetched from %d, want 110", got)
	}
}

func TestDepositWatcherStopsOnPublishFailure(t *testing.T) {
	ctx := context.Background()
	src, cur := &fakeSource{batch: twoDeposits}, NewMemoryCursors()
	pub := &flakyPublisher{failAt: 2}
	w := newWatcher(src, cur, pub)
	_ = w.loadCursor(ctx)

	w.Poll(ctx)
	// Первый депозит опубликован, второй нет: курсор на первом.
	if lt, _, _ := cur.Load(ctx, "EQwallet"); lt != 101 {
		t.Fatalf("cursor = %d, want 101", lt)
	}
	w.Poll(ctx)
	if got := src.called[len(src.called)-1]; got != 101 {
		t.Errorf("retry fetched from %d, want 101", got)
	}
}

func TestDepositWatcherFetchError(t *testing.T) {
	ctx := context.Background()
	src, cur := &fakeSource{err: errors.New("down")}, NewMemoryCursors()
	w := newWatcher(src, cur, &fakePublisher{})
	_ = w.loadCursor(ctx)
	if w.Poll(ctx) {
		t.Fatal("Poll must report no more work on error")
	}
	if _, ok, _ := cur.Load(ctx, "EQwallet"); ok {
		t.Fatal("cursor must not be saved on fetch error")
	}
}
