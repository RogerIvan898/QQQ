package amqp

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"
	"time"

	amqp091 "github.com/rabbitmq/amqp091-go"

	"gitlab.com/company-group7340831/poker/chain-service/internal/failure"
	"gitlab.com/company-group7340831/poker/chain-service/internal/text"
)

func TestIsTransient(t *testing.T) {
	transient := []error{
		failure.Transient(errors.New("node unavailable")),
		context.DeadlineExceeded,
		fmt.Errorf("wrap: %w", ErrNacked),
		ErrPublishTimeout,
		ErrReturned,
		amqp091.ErrClosed,
		&net.OpError{Op: "dial", Err: errors.New("connection refused")},
	}
	for _, err := range transient {
		if !IsTransient(err) {
			t.Errorf("IsTransient(%v) = false, want true", err)
		}
	}

	permanent := []error{
		nil,
		errors.New("unknown"),
		failure.Permanent(errors.New("bad json")),
		failure.Permanent(context.DeadlineExceeded), // явная пометка важнее эвристики
		context.Canceled,
	}
	for _, err := range permanent {
		if IsTransient(err) {
			t.Errorf("IsTransient(%v) = true, want false", err)
		}
	}
}

func TestRetryCount(t *testing.T) {
	cases := []struct {
		v    any
		want int
	}{
		{nil, 0},
		{int32(2), 2},
		{int64(3), 3},
		{int16(1), 1},
		{"2", 2},
		{"x", 0},
		{int32(-5), 0},
		{3.5, 0},
	}
	for _, c := range cases {
		h := amqp091.Table{}
		if c.v != nil {
			h[HeaderRetryCount] = c.v
		}
		if got := RetryCount(h); got != c.want {
			t.Errorf("RetryCount(%#v) = %d, want %d", c.v, got, c.want)
		}
	}
}

func TestRetryHeaders(t *testing.T) {
	src := amqp091.Table{
		"x-death":             []any{"..."},
		"x-first-death-queue": "withdrawals",
		"trace_id":            "abc",
		HeaderRetryCount:      int32(1),
	}
	h := retryHeaders(src, "id-1", 2, "withdrawals", errors.New("timeout"))

	if _, ok := h["x-death"]; ok {
		t.Error("x-death must be dropped")
	}
	if _, ok := h["x-first-death-queue"]; ok {
		t.Error("x-first-death-* must be dropped")
	}
	if h["trace_id"] != "abc" || h[HeaderMessageID] != "id-1" || h[HeaderOriginalQueue] != "withdrawals" {
		t.Errorf("unexpected headers: %v", h)
	}
	if RetryCount(h) != 2 {
		t.Errorf("retry count = %d, want 2", RetryCount(h))
	}
	if src[HeaderRetryCount] != int32(1) {
		t.Error("source headers must not be modified")
	}
}

func TestRetryQueues(t *testing.T) {
	got := RetryQueues("withdrawals", 5*time.Second, 3)
	want := []RetryQueue{
		{"withdrawals.retry.5s", 5 * time.Second},
		{"withdrawals.retry.10s", 10 * time.Second},
		{"withdrawals.retry.20s", 20 * time.Second},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d queues, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("queue %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

func TestNextBackoff(t *testing.T) {
	d := time.Second
	var seq []time.Duration
	for i := 0; i < 7; i++ {
		seq = append(seq, d)
		d = nextBackoff(d, 30*time.Second)
	}
	want := []time.Duration{1, 2, 4, 8, 16, 30, 30}
	for i := range want {
		if seq[i] != want[i]*time.Second {
			t.Fatalf("backoff sequence %v, want 1s,2s,4s,8s,16s,30s,30s", seq)
		}
	}
}

func TestTruncateKeepsUTF8(t *testing.T) {
	s := text.Truncate("ошибка", 3) // 3 байта режут вторую кириллическую букву
	if s != "о" {
		t.Errorf("truncate = %q, want %q", s, "о")
	}
}
