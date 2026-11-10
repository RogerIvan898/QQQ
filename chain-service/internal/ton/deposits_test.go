package ton

import (
	"context"
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

const txsJSON = `{"transactions":[
 {"hash":"dep1","lt":"101","now":1700000000,"description":{"aborted":false,"compute_ph":{"success":true}},
  "in_msg":{"source":"0:AAA","destination":"0:BBB","value":"50500000000","bounced":false,
   "message_content":{"decoded":{"type":"text_comment","comment":" user-42 "}}}},
 {"hash":"withdraw","lt":"102","description":{"aborted":false},
  "in_msg":{"source":null,"destination":"0:BBB","value":null}},
 {"hash":"bounce","lt":"103","description":{"aborted":false},
  "in_msg":{"source":"0:CCC","destination":"0:BBB","value":"1000","bounced":true}},
 {"hash":"aborted","lt":"104","description":{"aborted":true},
  "in_msg":{"source":"0:CCC","destination":"0:BBB","value":"1000"}},
 {"hash":"dep2","lt":"105","now":1700000100,"description":{"aborted":false},
  "in_msg":{"source":"0:DDD","destination":"0:BBB","value":"1"}}
]}`

func TestDepositsSince(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if r.URL.Path != "/api/v3/transactions" || q.Get("account") != "EQwallet" ||
			q.Get("start_lt") != "101" || q.Get("sort") != "asc" || q.Get("limit") != "5" {
			t.Errorf("unexpected request %s", r.URL)
		}
		_, _ = w.Write([]byte(txsJSON))
	})

	b, err := c.DepositsSince(context.Background(), "EQwallet", 100, 5)
	if err != nil {
		t.Fatal(err)
	}
	if b.NextLT != 105 || !b.Full {
		t.Errorf("NextLT=%d Full=%v, want 105 true", b.NextLT, b.Full)
	}
	if len(b.Deposits) != 2 {
		t.Fatalf("got %d deposits, want 2: %+v", len(b.Deposits), b.Deposits)
	}
	d := b.Deposits[0]
	if d.TxHash != "dep1" || d.LT != 101 || d.AmountNano != 50_500_000_000 || d.Comment != "user-42" || d.FromAddress != "0:AAA" {
		t.Errorf("unexpected deposit %+v", d)
	}
	if b.Deposits[1].TxHash != "dep2" || b.Deposits[1].Comment != "" {
		t.Errorf("unexpected deposit %+v", b.Deposits[1])
	}
}

func TestFormatNano(t *testing.T) {
	cases := map[uint64]string{
		1:              "0.000000001",
		1_500_000_000:  "1.5",
		50_000_000_000: "50",
		123_456_789:    "0.123456789",
		1_000_000_001:  "1.000000001",
	}
	for in, want := range cases {
		if got := FormatNano(in); got != want {
			t.Errorf("FormatNano(%d) = %q, want %q", in, got, want)
		}
	}
}

func TestMessageHash(t *testing.T) {
	c := cell.BeginCell().MustStoreUInt(42, 64).EndCell()
	boc := base64.StdEncoding.EncodeToString(c.ToBOC())
	h, err := MessageHash(boc)
	if err != nil {
		t.Fatal(err)
	}
	if want := base64.StdEncoding.EncodeToString(c.Hash()); h != want {
		t.Fatalf("hash = %s, want %s", h, want)
	}
	if _, err := MessageHash("!!!"); err == nil {
		t.Fatal("invalid base64 must fail")
	}
	if _, err := MessageHash(base64.StdEncoding.EncodeToString([]byte("junk"))); err == nil {
		t.Fatal("non-BOC bytes must fail")
	}
}
