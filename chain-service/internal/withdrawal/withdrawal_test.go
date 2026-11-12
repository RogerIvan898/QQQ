package withdrawal

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	amqp091 "github.com/rabbitmq/amqp091-go"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
	"gitlab.com/company-group7340831/poker/chain-service/internal/events"
	"gitlab.com/company-group7340831/poker/chain-service/internal/failure"
	"gitlab.com/company-group7340831/poker/chain-service/internal/ton"
)

// fakeRepo — Repository в памяти с той же семантикой переходов, что у PostgreSQL.
type fakeRepo struct {
	mu   sync.Mutex
	rows map[string]*Withdrawal
}

func newFakeRepo() *fakeRepo { return &fakeRepo{rows: map[string]*Withdrawal{}} }

func (r *fakeRepo) Get(_ context.Context, id string) (*Withdrawal, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if w, ok := r.rows[id]; ok {
		cp := *w
		return &cp, nil
	}
	return nil, nil
}

func (r *fakeRepo) InsertSigned(_ context.Context, w Withdrawal) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.rows[w.RequestID]; ok {
		return false, nil
	}
	w.BOCHash = BOCHash(w.BOC)
	w.Status = StatusSigned
	r.rows[w.RequestID] = &w
	return true, nil
}

func (r *fakeRepo) set(id string, f func(w *Withdrawal), from ...Status) error {
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
	return r.set(id, func(w *Withdrawal) {
		w.Status, w.MsgHash = StatusSent, h
		if w.SentAt.IsZero() {
			w.SentAt = time.Now()
		}
	}, StatusSigned, StatusSent)
}

func (r *fakeRepo) MarkConfirmed(_ context.Context, id, tx string) error {
	return r.set(id, func(w *Withdrawal) { w.Status, w.TxHash = StatusConfirmed, tx }, StatusSent)
}

func (r *fakeRepo) MarkFailed(_ context.Context, id, tx, reason string) error {
	return r.set(id, func(w *Withdrawal) { w.Status, w.TxHash, w.Error = StatusFailed, tx, reason }, StatusSent)
}

func (r *fakeRepo) ListSent(_ context.Context, sentAfter time.Time, limit int) ([]Withdrawal, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []Withdrawal
	for _, w := range r.rows {
		if w.Status == StatusSent && w.SentAt.After(sentAfter) && len(out) < limit {
			out = append(out, *w)
		}
	}
	return out, nil
}

func (r *fakeRepo) ListStale(_ context.Context, sentBefore time.Time, afterID string, limit int) ([]Withdrawal, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []Withdrawal
	for _, w := range r.rows {
		if w.Status == StatusSent && !w.SentAt.After(sentBefore) && w.RequestID > afterID && len(out) < limit {
			out = append(out, *w)
		}
	}
	return out, nil
}

func (r *fakeRepo) CountStale(ctx context.Context, sentBefore time.Time) (int, error) {
	stale, err := r.ListStale(ctx, sentBefore, "", 1<<30)
	return len(stale), err
}

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

// fakeTON считает отправки и отдаёт заданную транзакцию.
type fakeTON struct {
	sends       int
	attempts    int // все попытки отправки, включая неудачные
	scans       int // запросов окна транзакций
	single      int // запросов по одному сообщению
	sendErr     error
	failTimes   int // сколько первых попыток отправки падают с sendErr (0 — все)
	tx          *ton.Tx
	outOfWindow bool // вывод не попадает в окно последних транзакций
}

func (f *fakeTON) SendBoc(_ context.Context, boc string) (string, error) {
	f.attempts++
	if f.sendErr != nil && (f.failTimes == 0 || f.attempts <= f.failTimes) {
		return "", f.sendErr
	}
	f.sends++
	return "hash-" + boc[:4], nil
}

// testBOC — настоящий BOC с одной ячейкой (разный для разных n).
func testBOC(n uint64) string {
	return base64.StdEncoding.EncodeToString(cell.BeginCell().MustStoreUInt(n, 64).EndCell().ToBOC())
}

// fastBroadcaster — broadcaster с короткими паузами повторов для тестов.
func fastBroadcaster(repo Repository, tc ton.Client, pub events.Publisher) *Broadcaster {
	h := NewBroadcaster(BroadcasterConfig{}, repo, tc, NewResultPublisher(pub, "ex", "withdrawals.result"), zap.NewNop())
	h.retryInitial, h.retryMax = time.Millisecond, 5*time.Millisecond
	return h
}

func (f *fakeTON) FindTransaction(context.Context, string) (*ton.Tx, error) {
	f.single++
	return f.tx, nil
}

func (f *fakeTON) FindTransactions(_ context.Context, _ string, hashes []string, _ int) (map[string]*ton.Tx, error) {
	f.scans++
	out := map[string]*ton.Tx{}
	if f.tx != nil && !f.outOfWindow {
		for _, h := range hashes {
			out[h] = f.tx
		}
	}
	return out, nil
}

const testRequestID = "1b4e28ba-2fa1-11d2-883f-0016d3cca427"

func signedDelivery(t *testing.T, boc string) amqp091.Delivery {
	t.Helper()
	body, _ := json.Marshal(Signed{RequestID: testRequestID, BOC: boc, Seqno: 7})
	return amqp091.Delivery{
		ContentType: amqp.ContentTypeJSON,
		Type:        events.WithdrawSigned,
		Headers:     amqp091.Table{amqp.HeaderMessageID: "6f1d6c1e-5d1a-4c3e-9a35-0c7c6a3f2b11"},
		Body:        body,
	}
}

func lastResult(t *testing.T, pub *fakePublisher) Result {
	t.Helper()
	if len(pub.msgs) == 0 {
		t.Fatal("no result published")
	}
	var r Result
	if err := json.Unmarshal(pub.msgs[len(pub.msgs)-1].Body, &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestBroadcastHandler(t *testing.T) {
	log := zap.NewNop()
	boc := testBOC(1)

	t.Run("sends once, redelivery does not resend", func(t *testing.T) {
		repo, tc, pub := newFakeRepo(), &fakeTON{}, &fakePublisher{}
		h := NewBroadcaster(BroadcasterConfig{}, repo, tc, NewResultPublisher(pub, "ex", "withdrawals.result"), log)

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
		h := NewBroadcaster(BroadcasterConfig{}, repo, tc, NewResultPublisher(&fakePublisher{}, "ex", "rk"), log)
		if err := h.Handle(context.Background(), signedDelivery(t, boc)); err != nil {
			t.Fatal(err)
		}
		other := testBOC(2)
		_ = repo.MarkConfirmed(context.Background(), testRequestID, "x") // не важно: проверка BOC раньше статуса
		err := h.Handle(context.Background(), signedDelivery(t, other))
		if !failure.IsPermanent(err) || tc.sends != 1 {
			t.Fatalf("want permanent error and no resend, got %v (sends=%d)", err, tc.sends)
		}
	})

	t.Run("transient errors are retried in place until success", func(t *testing.T) {
		repo, pub := newFakeRepo(), &fakePublisher{}
		tc := &fakeTON{sendErr: failure.Transient(errors.New("timeout")), failTimes: 3}
		if err := fastBroadcaster(repo, tc, pub).Handle(context.Background(), signedDelivery(t, boc)); err != nil {
			t.Fatalf("Handle must keep retrying and succeed, got %v", err)
		}
		if tc.attempts != 4 || tc.sends != 1 {
			t.Fatalf("attempts=%d sends=%d, want 4 and 1", tc.attempts, tc.sends)
		}
		if lastResult(t, pub).Status != ResultSent {
			t.Fatal("sent result must be published")
		}
	})

	t.Run("shutdown stops the retry loop and leaves row signed", func(t *testing.T) {
		repo := newFakeRepo()
		tc := &fakeTON{sendErr: failure.Transient(errors.New("timeout"))}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
		defer cancel()
		err := fastBroadcaster(repo, tc, &fakePublisher{}).Handle(ctx, signedDelivery(t, boc))
		if err == nil || ctx.Err() == nil {
			t.Fatalf("want error after ctx cancel, got %v", err)
		}
		w, _ := repo.Get(context.Background(), testRequestID)
		if w == nil || w.Status != StatusSigned || w.MsgHash == "" {
			t.Fatalf("row must stay signed with msg_hash stored before send, got %+v", w)
		}
	})

	t.Run("rejected resend of a message already on chain counts as sent", func(t *testing.T) {
		repo, pub := newFakeRepo(), &fakePublisher{}
		// Кошелёк уже принял этот seqno: отправка отклоняется, но транзакция в сети есть.
		tc := &fakeTON{sendErr: failure.Transient(errors.New("cannot apply external message")), tx: &ton.Tx{Hash: "tx1", Success: true}}
		if err := fastBroadcaster(repo, tc, pub).Handle(context.Background(), signedDelivery(t, boc)); err != nil {
			t.Fatalf("Handle: %v", err)
		}
		w, _ := repo.Get(context.Background(), testRequestID)
		wantHash, _ := ton.MessageHash(boc)
		if w.Status != StatusSent || w.MsgHash != wantHash {
			t.Fatalf("row %+v, want sent with msg_hash %s", w, wantHash)
		}
		if lastResult(t, pub).Status != ResultSent {
			t.Fatal("sent result must be published")
		}
	})

	t.Run("invalid boc is permanent", func(t *testing.T) {
		err := fastBroadcaster(newFakeRepo(), &fakeTON{}, &fakePublisher{}).Handle(context.Background(),
			signedDelivery(t, base64.StdEncoding.EncodeToString([]byte("not a boc"))))
		if !failure.IsPermanent(err) {
			t.Fatalf("want permanent, got %v", err)
		}
	})
}

func TestConfirmPoller(t *testing.T) {
	log := zap.NewNop()
	boc := testBOC(1)
	ctx := context.Background()

	setup := func(tx *ton.Tx) (*fakeRepo, *fakePublisher, *ConfirmPoller) {
		repo, pub := newFakeRepo(), &fakePublisher{}
		_, _ = repo.InsertSigned(ctx, Withdrawal{RequestID: testRequestID, Seqno: 7, BOC: boc})
		_ = repo.MarkSent(ctx, testRequestID, "h")
		p := NewConfirmPoller(ConfirmPollerConfig{Interval: time.Second, Timeout: time.Minute, BatchSize: 10, StaleEvery: 1},
			repo, &fakeTON{tx: tx}, NewResultPublisher(pub, "ex", "rk"), log)
		return repo, pub, p
	}

	t.Run("confirmed", func(t *testing.T) {
		repo, pub, p := setup(&ton.Tx{Hash: "tx1", Success: true})
		p.Poll(ctx)
		w, _ := repo.Get(ctx, testRequestID)
		if w.Status != StatusConfirmed || w.TxHash != "tx1" {
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
		if w.Status != StatusFailed || lastResult(t, pub).Status != ResultFailed {
			t.Fatalf("row %+v", w)
		}
	})

	t.Run("one scan for many fresh withdrawals", func(t *testing.T) {
		repo, pub := newFakeRepo(), &fakePublisher{}
		for i := 0; i < 20; i++ {
			id := fmt.Sprintf("00000000-0000-4000-8000-%012d", i)
			_, _ = repo.InsertSigned(ctx, Withdrawal{RequestID: id, Seqno: uint32(i + 1), BOC: fmt.Sprint("boc", i)})
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
			_, _ = repo.InsertSigned(ctx, Withdrawal{RequestID: id, Seqno: uint32(i + 1), BOC: fmt.Sprint("old", i)})
			_ = repo.MarkSent(ctx, id, fmt.Sprint("old", i))
			repo.rows[id].SentAt = time.Now().Add(-time.Hour)
		}
		_, _ = repo.InsertSigned(ctx, Withdrawal{RequestID: testRequestID, Seqno: 9, BOC: boc})
		_ = repo.MarkSent(ctx, testRequestID, "fresh")

		tc := &fakeTON{tx: &ton.Tx{Hash: "tx", Success: true}}
		p := NewConfirmPoller(ConfirmPollerConfig{Interval: time.Second, Timeout: time.Minute, BatchSize: 2, StaleEvery: 100},
			repo, tc, NewResultPublisher(pub, "ex", "rk"), log)
		p.Poll(ctx)
		if w, _ := repo.Get(ctx, testRequestID); w.Status != StatusConfirmed {
			t.Fatalf("fresh withdrawal must be confirmed, got %s", w.Status)
		}
	})

	t.Run("timeout does not declare failed", func(t *testing.T) {
		repo, pub, p := setup(nil)
		p.Poll(ctx)
		p.now = func() time.Time { return time.Now().Add(2 * time.Minute) }
		p.Poll(ctx)
		w, _ := repo.Get(ctx, testRequestID)
		if w.Status != StatusSent || len(pub.msgs) != 0 {
			t.Fatalf("must stay sent without results, row %+v, published %d", w, len(pub.msgs))
		}
	})
}

func TestBroadcasterChecks(t *testing.T) {
	ctx := context.Background()
	hot, _ := ton.ParseAddress("0:" + strings.Repeat("ab", 32))
	other, _ := ton.ParseAddress("0:" + strings.Repeat("cd", 32))
	extBOC := func(dst *address.Address) string {
		c, err := tlb.ToCell(&tlb.ExternalMessage{SrcAddr: address.NewAddressNone(), DstAddr: dst,
			Body: cell.BeginCell().MustStoreUInt(1, 32).EndCell()})
		if err != nil {
			t.Fatal(err)
		}
		return base64.StdEncoding.EncodeToString(c.ToBOC())
	}
	newHandler := func(tc *fakeTON) *Broadcaster {
		h := NewBroadcaster(BroadcasterConfig{SignerUser: "signer", Wallet: hot}, newFakeRepo(), tc,
			NewResultPublisher(&fakePublisher{}, "ex", "rk"), zap.NewNop())
		h.retryInitial, h.retryMax = time.Millisecond, time.Millisecond
		return h
	}

	t.Run("foreign sender rejected", func(t *testing.T) {
		tc := &fakeTON{}
		d := signedDelivery(t, extBOC(hot))
		d.UserId = "core"
		if err := newHandler(tc).Handle(ctx, d); !failure.IsPermanent(err) || tc.attempts != 0 {
			t.Fatalf("err=%v attempts=%d", err, tc.attempts)
		}
	})

	t.Run("boc for another wallet rejected", func(t *testing.T) {
		tc := &fakeTON{}
		d := signedDelivery(t, extBOC(other))
		d.UserId = "signer"
		if err := newHandler(tc).Handle(ctx, d); !failure.IsPermanent(err) || tc.attempts != 0 {
			t.Fatalf("err=%v attempts=%d", err, tc.attempts)
		}
	})

	t.Run("signer and hot wallet accepted", func(t *testing.T) {
		tc := &fakeTON{}
		d := signedDelivery(t, extBOC(hot))
		d.UserId = "signer"
		if err := newHandler(tc).Handle(ctx, d); err != nil || tc.sends != 1 {
			t.Fatalf("err=%v sends=%d", err, tc.sends)
		}
	})

	t.Run("attempt metric reset after success", func(t *testing.T) {
		var last int
		tc := &fakeTON{sendErr: failure.Transient(errors.New("busy")), failTimes: 2}
		h := NewBroadcaster(BroadcasterConfig{OnAttempt: func(n int) { last = n }}, newFakeRepo(), tc,
			NewResultPublisher(&fakePublisher{}, "ex", "rk"), zap.NewNop())
		h.retryInitial, h.retryMax = time.Millisecond, time.Millisecond
		if err := h.Handle(ctx, signedDelivery(t, testBOC(5))); err != nil || last != 0 || tc.attempts != 3 {
			t.Fatalf("err=%v last=%d attempts=%d", err, last, tc.attempts)
		}
	})
}

func TestConfirmPollerLooksUpOutOfWindow(t *testing.T) {
	ctx := context.Background()
	repo, pub := newFakeRepo(), &fakePublisher{}
	_, _ = repo.InsertSigned(ctx, Withdrawal{RequestID: testRequestID, Seqno: 7, BOC: testBOC(1)})
	_ = repo.MarkSent(ctx, testRequestID, "h")
	tc := &fakeTON{tx: &ton.Tx{Hash: "tx1", Success: true}, outOfWindow: true}
	p := NewConfirmPoller(ConfirmPollerConfig{Interval: time.Second, Timeout: time.Hour, BatchSize: 10, MissesBeforeLookup: 3},
		repo, tc, NewResultPublisher(pub, "ex", "rk"), zap.NewNop())

	p.Poll(ctx)
	p.Poll(ctx)
	if w, _ := repo.Get(ctx, testRequestID); w.Status != StatusSent || tc.single != 0 {
		t.Fatalf("looked up too early: status=%s single=%d", w.Status, tc.single)
	}
	p.Poll(ctx)
	if w, _ := repo.Get(ctx, testRequestID); w.Status != StatusConfirmed || tc.single != 1 {
		t.Fatalf("not confirmed by lookup: status=%s single=%d", w.Status, tc.single)
	}
}
