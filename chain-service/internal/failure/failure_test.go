package failure

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"
)

type selfTransient struct{}

func (selfTransient) Error() string   { return "self" }
func (selfTransient) Transient() bool { return true }

func TestIsTransient(t *testing.T) {
	transient := []error{
		Transient(errors.New("node unavailable")),
		fmt.Errorf("wrapped: %w", Transient(errors.New("x"))),
		context.DeadlineExceeded,
		&net.OpError{Op: "dial", Err: errors.New("refused")},
		fmt.Errorf("publish: %w", selfTransient{}),
	}
	for _, err := range transient {
		if !IsTransient(err) {
			t.Errorf("IsTransient(%v) = false, want true", err)
		}
	}

	notTransient := []error{
		nil,
		errors.New("unknown"),
		Permanent(errors.New("bad json")),
		Permanent(context.DeadlineExceeded), // явная пометка важнее эвристики
		context.Canceled,
	}
	for _, err := range notTransient {
		if IsTransient(err) {
			t.Errorf("IsTransient(%v) = true, want false", err)
		}
	}
}

func TestNilStaysNil(t *testing.T) {
	if Permanent(nil) != nil || Transient(nil) != nil {
		t.Fatal("wrapping nil must return nil")
	}
}
