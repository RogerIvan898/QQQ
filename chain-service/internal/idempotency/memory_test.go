package idempotency

import (
	"testing"
	"time"
)

func TestMemoryStoreTTL(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	s := NewMemoryStore(time.Hour)
	s.now = func() time.Time { return now }

	if s.Seen("a") {
		t.Fatal("unknown id must not be seen")
	}
	s.Mark("a")
	if !s.Seen("a") {
		t.Fatal("marked id must be seen")
	}

	now = now.Add(59 * time.Minute)
	if !s.Seen("a") {
		t.Fatal("id must be seen before TTL expires")
	}

	s.Mark("b")
	now = now.Add(2 * time.Minute) // "a" истёк, "b" ещё жив
	if s.Seen("a") {
		t.Fatal("id must expire after TTL")
	}
	if removed := s.Cleanup(); removed != 0 {
		t.Fatalf("Seen already removed expired id, Cleanup removed %d", removed)
	}

	now = now.Add(time.Hour)
	if removed := s.Cleanup(); removed != 1 {
		t.Fatalf("Cleanup removed %d, want 1", removed)
	}
	if s.Len() != 0 {
		t.Fatalf("Len = %d, want 0", s.Len())
	}
}
