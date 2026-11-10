package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"testing"

	amqp091 "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
)

func TestParseAmount(t *testing.T) {
	ok := map[string]uint64{
		"50.0":                  50_000_000_000,
		"50":                    50_000_000_000,
		"0.000000001":           1,
		"1.5":                   1_500_000_000,
		"007.10":                7_100_000_000,
		"18446744073.709551615": 18446744073709551615,
	}
	for in, want := range ok {
		got, err := ParseAmount(in, tonDecimals)
		if err != nil || got != want {
			t.Errorf("ParseAmount(%q) = %d, %v; want %d", in, got, err, want)
		}
	}

	bad := []string{"", "0", "0.0", "-1", "1.", ".5", "1e9", "1,5", "1.0000000001", "18446744073.709551616", "abc", " 1 2"}
	for _, in := range bad {
		if _, err := ParseAmount(in, tonDecimals); err == nil {
			t.Errorf("ParseAmount(%q): expected error", in)
		}
	}
}

// friendly собирает user-friendly адрес для тестов.
func friendly(flags, wc byte, hash [32]byte, urlSafe bool) string {
	raw := append([]byte{flags, wc}, hash[:]...)
	crc := crc16XMODEM(raw)
	raw = append(raw, byte(crc>>8), byte(crc))
	if urlSafe {
		return base64.URLEncoding.EncodeToString(raw)
	}
	return base64.StdEncoding.EncodeToString(raw)
}

func TestValidateTONAddress(t *testing.T) {
	var hash [32]byte
	for i := range hash {
		hash[i] = byte(i * 7)
	}

	valid := []string{
		// Общеизвестный «нулевой» адрес basechain.
		"EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
		friendly(0x11, 0x00, hash, true),
		friendly(0x51, 0x00, hash, false),
		friendly(0x91, 0xff, hash, true), // testnet bounceable, masterchain
		"0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8",
		"-1:3333333333333333333333333333333333333333333333333333333333333333",
	}
	for _, a := range valid {
		if err := ValidateTONAddress(a); err != nil {
			t.Errorf("ValidateTONAddress(%q): %v", a, err)
		}
	}

	good := friendly(0x11, 0x00, hash, true)
	broken := []byte(good)
	if broken[10] == 'A' {
		broken[10] = 'B'
	} else {
		broken[10] = 'A'
	}
	invalid := []string{
		"",
		"hello",
		string(broken),                   // контрольная сумма не сходится
		friendly(0x22, 0x00, hash, true), // неизвестные флаги
		friendly(0x11, 0x05, hash, true), // неизвестный workchain
		"2:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8",
		"0:83df",
		"0:zzdfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8",
	}
	for _, a := range invalid {
		if err := ValidateTONAddress(a); err == nil {
			t.Errorf("ValidateTONAddress(%q): expected error", a)
		}
	}
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

func withdrawDelivery(t *testing.T, req WithdrawRequested) amqp091.Delivery {
	t.Helper()
	body, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	return amqp091.Delivery{
		ContentType: amqp.ContentTypeJSON,
		Type:        EventWithdrawRequested,
		Headers:     amqp091.Table{amqp.HeaderMessageID: "6f1d6c1e-5d1a-4c3e-9a35-0c7c6a3f2b11"},
		Body:        body,
	}
}

func TestWithdrawalHandler(t *testing.T) {
	log := zap.NewNop()
	valid := WithdrawRequested{
		RequestID: "1b4e28ba-2fa1-11d2-883f-0016d3cca427",
		UserID:    123,
		Amount:    "50.0",
		Asset:     AssetTON,
		ToAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
	}

	t.Run("signs and publishes", func(t *testing.T) {
		pub := &fakePublisher{}
		h := NewWithdrawalHandler(pub, NewStubSigner(log), "core.events", "withdrawals.signed", log)
		if err := h.Handle(context.Background(), withdrawDelivery(t, valid)); err != nil {
			t.Fatalf("Handle: %v", err)
		}
		if len(pub.msgs) != 1 {
			t.Fatalf("published %d messages, want 1", len(pub.msgs))
		}
		m := pub.msgs[0]
		if m.Exchange != "core.events" || m.RoutingKey != "withdrawals.signed" || m.Type != EventWithdrawSigned {
			t.Errorf("unexpected routing: %+v", m)
		}
		if m.MessageID != DeterministicID(EventWithdrawSigned, valid.RequestID) {
			t.Errorf("message_id is not deterministic: %s", m.MessageID)
		}
		var signed WithdrawSigned
		if err := json.Unmarshal(m.Body, &signed); err != nil {
			t.Fatal(err)
		}
		if signed.RequestID != valid.RequestID || signed.BOC == "" || signed.Seqno != 1 {
			t.Errorf("unexpected payload: %+v", signed)
		}
	})

	t.Run("invalid request is permanent", func(t *testing.T) {
		bad := valid
		bad.Amount = "-5"
		h := NewWithdrawalHandler(&fakePublisher{}, NewStubSigner(log), "x", "y", log)
		err := h.Handle(context.Background(), withdrawDelivery(t, bad))
		if !amqp.IsPermanent(err) {
			t.Fatalf("want permanent error, got %v", err)
		}
	})

	t.Run("wrong event type is permanent", func(t *testing.T) {
		d := withdrawDelivery(t, valid)
		d.Type = "SOMETHING_ELSE"
		h := NewWithdrawalHandler(&fakePublisher{}, NewStubSigner(log), "x", "y", log)
		if err := h.Handle(context.Background(), d); !amqp.IsPermanent(err) {
			t.Fatalf("want permanent error, got %v", err)
		}
	})

	t.Run("publish failure is transient", func(t *testing.T) {
		h := NewWithdrawalHandler(&fakePublisher{err: amqp.ErrPublishTimeout}, NewStubSigner(log), "x", "y", log)
		err := h.Handle(context.Background(), withdrawDelivery(t, valid))
		if !amqp.IsTransient(err) || !errors.Is(err, amqp.ErrPublishTimeout) {
			t.Fatalf("want transient publish timeout, got %v", err)
		}
	})
}
