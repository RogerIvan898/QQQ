package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	amqp091 "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
	"gitlab.com/company-group7340831/poker/chain-service/internal/store"
	"gitlab.com/company-group7340831/poker/chain-service/internal/ton"
)

// fakeRepo — WithdrawalRepo в памяти с той же семантикой переходов, что у MySQL.
type fakeRepo struct {
	mu   sync.Mutex
	rows map[string]*store.Withdrawal
}

func newFakeRepo() *fakeRepo { return &fakeRepo{rows: map[string]*store.Withdrawal{}} }

func (r *fakeRepo) Get(_ context.Context, id string) (*store.Withdrawal, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if w, ok := r.rows[id]; ok {
		cp := *w
		return &cp, nil
	}
	return nil, nil
}

func (r *fakeRepo) InsertSigned(_ context.Context, w store.Withdrawal) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.rows[w.RequestID]; ok {
		return false, nil
	}
	w.BOCHash = store.BOCHash(w.BOC)
	w.Status = store.StatusSigned
	r.rows[w.RequestID] = &w
	return true, nil
}

func (r *fakeRepo) set(id string, f func(w *store.Withdrawal), from ...string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	w, ok := r.rows[id]
	if !ok {
		return nil
	}
	for _, s := range from {
		if w.Status == s {
			f(w)
			return nil
		}
	}
	return nil
}

func (r *fakeRepo) MarkSent(_ context.Context, id, h string) error {
	return r.set(id, func(w *store.Withdrawal) {
		w.Status, w.MsgHash = store.StatusSent, h
		if w.SentAt.IsZero() {
			w.SentAt = time.Now()
		}
	}, store.StatusSigned, store.StatusSent)
}

func (r *fakeRepo) MarkConfirmed(_ context.Context, id, tx string) error {
	return r.set(id, func(w *store.Withdrawal) { w.Status, w.TxHash = store.StatusConfirmed, tx }, store.StatusSent)
}

func (r *fakeRepo) MarkFailed(_ context.Context, id, tx, reason string) error {
	return r.set(id, func(w *store.Withdrawal) { w.Status, w.TxHash, w.Error = store.StatusFailed, tx, reason }, store.StatusSent)
}

func (r *fakeRepo) MaxSeqno(context.Context) (uint32, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var m uint32
	for _, w := range r.rows {
		if w.Seqno > m {
			m = w.Seqno
		}
	}
	return m, nil
}

func (r *fakeRepo) ListSent(_ context.Context, sentAfter time.Time, limit int) ([]store.Withdrawal, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []store.Withdrawal
	for _, w := range r.rows {
		if w.Status == store.StatusSent && w.SentAt.After(sentAfter) && len(out) < limit {
			out = append(out, *w)
		}
	}
	return out, nil
}

func (r *fakeRepo) ListStale(_ context.Context, sentBefore time.Time, afterID string, limit int) ([]store.Withdrawal, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []store.Withdrawal
	for _, w := range r.rows {
		if w.Status == store.StatusSent && !w.SentAt.After(sentBefore) && w.RequestID > afterID && len(out) < limit {
			out = append(out, *w)
		}
	}
	return out, nil
}

// fakeTON считает отправки и отдаёт заданную транзакцию.
type fakeTON struct {
	sends   int
	scans   int // запросов окна транзакций
	single  int // запросов по одному сообщению
	sendErr error
	tx      *ton.Tx
}

func (f *fakeTON) SendBoc(_ context.Context, boc string) (string, error) {
	if f.sendErr != nil {
		return "", f.sendErr
	}
	f.sends++
	return "hash-" + boc[:4], nil
}

func (f *fakeTON) FindTransaction(context.Context, string) (*ton.Tx, error) {
	f.single++
	return f.tx, nil
}

func (f *fakeTON) FindTransactions(_ context.Context, _ string, hashes []string, _ int) (map[string]*ton.Tx, error) {
	f.scans++
	out := map[string]*ton.Tx{}
	if f.tx != nil {
		for _, h := range hashes {
			out[h] = f.tx
		}
	}
	return out, nil
}

const testRequestID = "1b4e28ba-2fa1-11d2-883f-0016d3cca427"

func signedDelivery(t *testing.T, boc string) amqp091.Delivery {
	t.Helper()
	body, _ := json.Marshal(WithdrawSigned{RequestID: testRequestID, BOC: boc, Seqno: 7})
	return amqp091.Delivery{
		ContentType: amqp.ContentTypeJSON,
		Type:        EventWithdrawSigned,
		Headers:     amqp091.Table{amqp.HeaderMessageID: "6f1d6c1e-5d1a-4c3e-9a35-0c7c6a3f2b11"},
		Body:        body,
	}
}

func lastResult(t *testing.T, pub *fakePublisher) WithdrawResult {
	t.Helper()
	if len(pub.msgs) == 0 {
		t.Fatal("no result published")
	}
	var r WithdrawResult
	if err := json.Unmarshal(pub.msgs[len(pub.msgs)-1].Body, &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestBroadcastHandler(t *testing.T) {
	log := zap.NewNop()
	boc := base64.StdEncoding.EncodeToString([]byte("boc-one"))

	t.Run("sends once, redelivery does not resend", func(t *testing.T) {
		repo, tc, pub := newFakeRepo(), &fakeTON{}, &fakePublisher{}
		h := NewBroadcastHandler(repo, tc, NewResultPublisher(pub, "ex", "withdrawals.result"), log)

		for i := 0; i < 2; i++ {
			if err := h.Handle(context.Background(), signedDelivery(t, boc)); err != nil {
				t.Fatalf("Handle #%d: %v", i, err)
			}
		}
		if tc.sends != 1 {
			t.Fatalf("SendBoc called %d times, want 1", tc.sends)
		}
		if r := lastResult(t, pub); r.Status != ResultSent || r.RequestID != testRequestID {
			t.Errorf("unexpected result %+v", r)
		}
		// Обе публикации «sent» — с одним message_id.
		if pub.msgs[0].MessageID != pub.msgs[1].MessageID {
			t.Error("sent result must have a deterministic message_id")
		}
	})

	t.Run("conflicting boc is refused", func(t *testing.T) {
		repo, tc := newFakeRepo(), &fakeTON{}
		h := NewBroadcastHandler(repo, tc, NewResultPublisher(&fakePublisher{}, "ex", "rk"), log)
		if err := h.Handle(context.Background(), signedDelivery(t, boc)); err != nil {
			t.Fatal(err)
		}
		other := base64.StdEncoding.EncodeToString([]byte("boc-two"))
		_ = repo.MarkConfirmed(context.Background(), testRequestID, "x") // не важно: проверка BOC раньше статуса
		err := h.Handle(context.Background(), signedDelivery(t, other))
		if !amqp.IsPermanent(err) || tc.sends != 1 {
			t.Fatalf("want permanent error and no resend, got %v (sends=%d)", err, tc.sends)
		}
	})

	t.Run("network error is transient and leaves row signed", func(t *testing.T) {
		repo := newFakeRepo()
		tc := &fakeTON{sendErr: amqp.Transient(errors.New("timeout"))}
		h := NewBroadcastHandler(repo, tc, NewResultPublisher(&fakePublisher{}, "ex", "rk"), log)
		err := h.Handle(context.Background(), signedDelivery(t, boc))
		if !amqp.IsTransient(err) {
			t.Fatalf("want transient, got %v", err)
		}
		w, _ := repo.Get(context.Background(), testRequestID)
		if w == nil || w.Status != store.StatusSigned {
			t.Fatalf("row must stay signed, got %+v", w)
		}
	})
}

func TestConfirmPoller(t *testing.T) {
	log := zap.NewNop()
	boc := base64.StdEncoding.EncodeToString([]byte("boc-one"))
	ctx := context.Background()

	setup := func(tx *ton.Tx) (*fakeRepo, *fakePublisher, *ConfirmPoller) {
		repo, pub := newFakeRepo(), &fakePublisher{}
		_, _ = repo.InsertSigned(ctx, store.Withdrawal{RequestID: testRequestID, Seqno: 7, BOC: boc})
		_ = repo.MarkSent(ctx, testRequestID, "h")
		p := NewConfirmPoller(ConfirmPollerConfig{Interval: time.Second, Timeout: time.Minute, BatchSize: 10, StaleEvery: 1},
			repo, &fakeTON{tx: tx}, NewResultPublisher(pub, "ex", "rk"), log)
		return repo, pub, p
	}

	t.Run("confirmed", func(t *testing.T) {
		repo, pub, p := setup(&ton.Tx{Hash: "tx1", Success: true})
		p.Poll(ctx)
		w, _ := repo.Get(ctx, testRequestID)
		if w.Status != store.StatusConfirmed || w.TxHash != "tx1" {
			t.Fatalf("row %+v", w)
		}
		if r := lastResult(t, pub); r.Status != ResultConfirmed || r.TxHash != "tx1" {
			t.Fatalf("result %+v", r)
		}
	})

	t.Run("aborted transaction fails", func(t *testing.T) {
		repo, pub, p := setup(&ton.Tx{Hash: "tx2", Success: false, Reason: "transaction aborted"})
		p.Poll(ctx)
		w, _ := repo.Get(ctx, testRequestID)
		if w.Status != store.StatusFailed || lastResult(t, pub).Status != ResultFailed {
			t.Fatalf("row %+v", w)
		}
	})

	t.Run("one scan for many fresh withdrawals", func(t *testing.T) {
		repo, pub := newFakeRepo(), &fakePublisher{}
		for i := 0; i < 20; i++ {
			id := fmt.Sprintf("00000000-0000-4000-8000-%012d", i)
			_, _ = repo.InsertSigned(ctx, store.Withdrawal{RequestID: id, Seqno: uint32(i + 1), BOC: fmt.Sprint("boc", i)})
			_ = repo.MarkSent(ctx, id, fmt.Sprint("h", i))
		}
		tc := &fakeTON{tx: &ton.Tx{Hash: "tx", Success: true}}
		p := NewConfirmPoller(ConfirmPollerConfig{Interval: time.Second, Timeout: time.Minute, BatchSize: 50},
			repo, tc, NewResultPublisher(pub, "ex", "rk"), log)
		p.Poll(ctx)
		if tc.scans != 1 || tc.single != 0 {
			t.Fatalf("scans=%d single=%d, want 1 and 0", tc.scans, tc.single)
		}
		if len(pub.msgs) != 20 {
			t.Fatalf("published %d results, want 20", len(pub.msgs))
		}
	})

	t.Run("stale withdrawals do not block fresh ones", func(t *testing.T) {
		repo, pub := newFakeRepo(), &fakePublisher{}
		for i := 0; i < 5; i++ { // зависшие, больше BatchSize
			id := fmt.Sprintf("00000000-0000-4000-8000-%012d", i)
			_, _ = repo.InsertSigned(ctx, store.Withdrawal{RequestID: id, Seqno: uint32(i + 1), BOC: fmt.Sprint("old", i)})
			_ = repo.MarkSent(ctx, id, fmt.Sprint("old", i))
			repo.rows[id].SentAt = time.Now().Add(-time.Hour)
		}
		_, _ = repo.InsertSigned(ctx, store.Withdrawal{RequestID: testRequestID, Seqno: 9, BOC: boc})
		_ = repo.MarkSent(ctx, testRequestID, "fresh")

		tc := &fakeTON{tx: &ton.Tx{Hash: "tx", Success: true}}
		p := NewConfirmPoller(ConfirmPollerConfig{Interval: time.Second, Timeout: time.Minute, BatchSize: 2, StaleEvery: 100},
			repo, tc, NewResultPublisher(pub, "ex", "rk"), log)
		p.Poll(ctx)
		if w, _ := repo.Get(ctx, testRequestID); w.Status != store.StatusConfirmed {
			t.Fatalf("fresh withdrawal must be confirmed, got %s", w.Status)
		}
	})

	t.Run("timeout does not declare failed", func(t *testing.T) {
		repo, pub, p := setup(nil)
		p.Poll(ctx)
		p.now = func() time.Time { return time.Now().Add(2 * time.Minute) }
		p.Poll(ctx)
		w, _ := repo.Get(ctx, testRequestID)
		if w.Status != store.StatusSent || len(pub.msgs) != 0 {
			t.Fatalf("must stay sent without results, row %+v, published %d", w, len(pub.msgs))
		}
	})
}

func TestWithdrawalHandlerSeqnoFromDB(t *testing.T) {
	log := zap.NewNop()
	repo, pub := newFakeRepo(), &fakePublisher{}
	_, _ = repo.InsertSigned(context.Background(), store.Withdrawal{RequestID: "00000000-0000-4000-8000-000000000001", Seqno: 41, BOC: "x"})
	h := NewWithdrawalHandler(pub, NewStubSigner(log), repo, "ex", "rk", log)
	req := WithdrawRequested{RequestID: testRequestID, UserID: 5, Amount: "1", Asset: AssetTON,
		ToAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"}
	if err := h.Handle(context.Background(), withdrawDelivery(t, req)); err != nil {
		t.Fatal(err)
	}
	var signed WithdrawSigned
	_ = json.Unmarshal(pub.msgs[0].Body, &signed)
	if signed.Seqno != 42 {
		t.Fatalf("seqno = %d, want MAX(seqno)+1 = 42", signed.Seqno)
	}
}

func TestWithdrawalHandlerDoesNotResign(t *testing.T) {
	log := zap.NewNop()
	repo, pub := newFakeRepo(), &fakePublisher{}
	h := NewWithdrawalHandler(pub, NewStubSigner(log), repo, "ex", "rk", log)
	req := WithdrawRequested{RequestID: testRequestID, UserID: 5, Amount: "1", Asset: AssetTON,
		ToAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"}

	for i := 0; i < 2; i++ {
		if err := h.Handle(context.Background(), withdrawDelivery(t, req)); err != nil {
			t.Fatal(err)
		}
	}
	if string(pub.msgs[0].Body) != string(pub.msgs[1].Body) {
		t.Fatal("second delivery must republish the same signed BOC")
	}

	req.Amount = "2"
	if err := h.Handle(context.Background(), withdrawDelivery(t, req)); !amqp.IsPermanent(err) {
		t.Fatalf("reused request_id with other amount must be permanent, got %v", err)
	}
}
