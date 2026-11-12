package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/withdrawal"
)

// Интеграционный тест: запускается, только если задан POSTGRES_TEST_DSN,
// например postgres://chain:chain@localhost:5432/chain?sslmode=disable.
func openTestDB(t *testing.T) *Withdrawals {
	t.Helper()
	dsn := os.Getenv("POSTGRES_TEST_DSN")
	if dsn == "" {
		t.Skip("POSTGRES_TEST_DSN not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := Open(ctx, dsn, 4)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	// Повторное применение схемы должно проходить без ошибок.
	if err := migrate(ctx, db); err != nil {
		t.Fatalf("migrate twice: %v", err)
	}
	return NewWithdrawals(db)
}

func TestPostgresWithdrawalLifecycle(t *testing.T) {
	repo := openTestDB(t)
	ctx := context.Background()
	id := uuid.NewString()

	inserted, err := repo.InsertSigned(ctx, withdrawal.Withdrawal{RequestID: id, Seqno: 4_000_000_000, BOC: "boc", MsgHash: "h1", AmountNano: 5})
	if err != nil || !inserted {
		t.Fatalf("insert: %v %v", inserted, err)
	}
	again, err := repo.InsertSigned(ctx, withdrawal.Withdrawal{RequestID: id, Seqno: 1, BOC: "other"})
	if err != nil || again {
		t.Fatalf("duplicate insert: %v %v", again, err)
	}

	w, err := repo.Get(ctx, id)
	if err != nil || w == nil {
		t.Fatalf("get: %v %v", w, err)
	}
	if w.Seqno != 4_000_000_000 || w.Status != withdrawal.StatusSigned || w.BOCHash != withdrawal.BOCHash("boc") || w.AmountNano != 5 {
		t.Fatalf("unexpected row: %+v", w)
	}

	if err := repo.MarkSent(ctx, id, "h1"); err != nil {
		t.Fatal(err)
	}
	sent, err := repo.ListSent(ctx, time.Now().Add(-time.Minute), 100)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, s := range sent {
		found = found || s.RequestID == id
	}
	if !found {
		t.Fatal("sent withdrawal not listed")
	}
	stale, err := repo.ListStale(ctx, time.Now().Add(time.Minute), "", 1000)
	if err != nil || len(stale) == 0 {
		t.Fatalf("list stale: %v %v", len(stale), err)
	}

	if err := repo.MarkConfirmed(ctx, id, "tx1"); err != nil {
		t.Fatal(err)
	}
	if err := repo.MarkFailed(ctx, id, "tx2", "late"); err != nil {
		t.Fatal(err)
	}
	w, _ = repo.Get(ctx, id)
	if w.Status != withdrawal.StatusConfirmed || w.TxHash != "tx1" || w.SentAt.IsZero() {
		t.Fatalf("confirmed row changed or wrong: %+v", w)
	}
}

func TestPostgresCursorsAndIdempotency(t *testing.T) {
	repo := openTestDB(t)
	ctx := context.Background()
	cursors := NewCursors(repo.db)
	account := "acc-" + uuid.NewString()

	if _, ok, err := cursors.Load(ctx, account); err != nil || ok {
		t.Fatalf("empty load: %v %v", ok, err)
	}
	for _, lt := range []uint64{50_000_000_000_000, 10, 60_000_000_000_000} {
		if err := cursors.Save(ctx, account, lt); err != nil {
			t.Fatal(err)
		}
	}
	lt, ok, err := cursors.Load(ctx, account)
	if err != nil || !ok || lt != 60_000_000_000_000 {
		t.Fatalf("cursor must only grow: %v %v %v", lt, ok, err)
	}

	idem := NewIdempotency(repo.db, time.Hour, zap.NewNop())
	msg := uuid.NewString()
	if idem.Seen(msg) {
		t.Fatal("unseen message reported as seen")
	}
	idem.Mark(msg)
	idem.Mark(msg)
	if !idem.Seen(msg) {
		t.Fatal("marked message not seen")
	}

	expired := NewIdempotency(repo.db, -time.Hour, zap.NewNop())
	old := uuid.NewString()
	expired.Mark(old)
	if expired.Seen(old) {
		t.Fatal("expired key reported as seen")
	}
	if removed := expired.cleanup(ctx); removed < 1 {
		t.Fatalf("cleanup removed %d", removed)
	}
}

func TestPostgresRunExclusive(t *testing.T) {
	repo := openTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	key := LockKey("test", uuid.NewString())

	started := make(chan struct{})
	release := make(chan struct{})
	firstDone := make(chan error, 1)
	go func() {
		firstDone <- RunExclusive(ctx, repo.db, key, zap.NewNop(), nil, func(context.Context) error {
			close(started)
			<-release
			return nil
		})
	}()
	<-started

	secondRan := make(chan struct{})
	go func() {
		_ = RunExclusive(ctx, repo.db, key, zap.NewNop(), nil, func(context.Context) error {
			close(secondRan)
			return nil
		})
	}()
	select {
	case <-secondRan:
		t.Fatal("second instance ran while the lock was held")
	case <-time.After(time.Second):
	}

	close(release)
	if err := <-firstDone; err != nil {
		t.Fatal(err)
	}
	select {
	case <-secondRan:
	case <-time.After(2 * lockRetryInterval):
		t.Fatal("second instance did not take the lock after release")
	}
}
