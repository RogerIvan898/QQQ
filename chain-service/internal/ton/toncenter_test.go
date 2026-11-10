package ton

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
)

func newTestClient(t *testing.T, h http.HandlerFunc) *Toncenter {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return NewToncenter(ToncenterConfig{BaseURL: srv.URL, APIKey: "mock-key", RPS: 1000, Timeout: 2 * time.Second})
}

func TestSendBoc(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v2/sendBocReturnHash" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("X-API-Key") != "mock-key" {
			t.Error("api key header missing")
		}
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["boc"] != "te6cc" {
			t.Errorf("boc = %q", body["boc"])
		}
		_, _ = w.Write([]byte(`{"ok":true,"result":{"@type":"ext.message.info","hash":"raw","hash_norm":"norm"}}`))
	})
	h, err := c.SendBoc(context.Background(), "te6cc")
	if err != nil || h != "raw" {
		t.Fatalf("SendBoc = %q, %v", h, err)
	}
}

func TestSendBocErrors(t *testing.T) {
	cases := map[int]bool{ // status → transient?
		http.StatusBadRequest:          false,
		http.StatusTooManyRequests:     true,
		http.StatusInternalServerError: true,
		http.StatusUnauthorized:        true,
	}
	for status, transient := range cases {
		c := newTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"ok":false,"error":"boom","code":` + http.StatusText(status) + `}`))
		})
		_, err := c.SendBoc(context.Background(), "x")
		if err == nil || amqp.IsTransient(err) != transient {
			t.Errorf("status %d: err=%v transient=%v, want transient=%v", status, err, amqp.IsTransient(err), transient)
		}
	}
}

func TestFindTransaction(t *testing.T) {
	t.Run("found", func(t *testing.T) {
		c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/v3/transactionsByMessage" || r.URL.Query().Get("msg_hash") != "a+b/c=" {
				t.Errorf("unexpected request %s", r.URL)
			}
			_, _ = w.Write([]byte(`{"transactions":[{"hash":"tx","lt":"42","description":{"aborted":false,"compute_ph":{"success":true,"exit_code":0}}}]}`))
		})
		tx, err := c.FindTransaction(context.Background(), "a+b/c=")
		if err != nil || tx == nil || tx.Hash != "tx" || !tx.Success {
			t.Fatalf("tx=%+v err=%v", tx, err)
		}
	})

	t.Run("aborted", func(t *testing.T) {
		c := newTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"transactions":[{"hash":"tx","description":{"aborted":true}}]}`))
		})
		tx, err := c.FindTransaction(context.Background(), "h")
		if err != nil || tx == nil || tx.Success {
			t.Fatalf("tx=%+v err=%v", tx, err)
		}
	})

	t.Run("not yet", func(t *testing.T) {
		for _, status := range []int{http.StatusOK, http.StatusNotFound} {
			c := newTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"transactions":[]}`))
			})
			tx, err := c.FindTransaction(context.Background(), "h")
			if err != nil || tx != nil {
				t.Fatalf("status %d: tx=%+v err=%v", status, tx, err)
			}
		}
	})
}

func TestFindTransactions(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if r.URL.Path != "/api/v3/transactions" || q.Get("account") != "EQhot" || q.Get("sort") != "desc" || q.Get("limit") != "100" {
			t.Errorf("unexpected request %s", r.URL)
		}
		_, _ = w.Write([]byte(`{"transactions":[
		 {"hash":"tx1","lt":"10","description":{"aborted":false},"in_msg":{"hash":"m1","source":null}},
		 {"hash":"tx2","lt":"11","description":{"aborted":true},"in_msg":{"hash":"x","hash_norm":"m2","source":null}},
		 {"hash":"tx3","lt":"12","description":{"aborted":false},"in_msg":{"hash":"m3","source":"0:AAA"}}
		]}`))
	})
	got, err := c.FindTransactions(context.Background(), "EQhot", []string{"m1", "m2", "m3", "m4"}, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got["m1"].Hash != "tx1" || !got["m1"].Success || got["m2"].Success {
		t.Fatalf("unexpected result %+v", got)
	}
	if got["m3"] != nil {
		t.Error("internal incoming message must not match a withdrawal")
	}
}
