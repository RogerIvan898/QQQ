package config

import (
	"strings"
	"testing"
)

func baseEnv(t *testing.T) {
	t.Helper()
	t.Setenv("RABBITMQ_URL", "amqp://chain-svc:secret@rabbit:5672/")
	t.Setenv("POSTGRES_DSN", "postgres://u:p@db:5432/x")
	t.Setenv("TON_WALLET_ADDRESS", "0:"+strings.Repeat("ab", 32))
	t.Setenv("TON_DEPOSIT_ADDRESS", "0:"+strings.Repeat("cd", 32))
	t.Setenv("SIGNER_RABBIT_USER", "signer")
}

func TestToncenterURLMustBeHTTPS(t *testing.T) {
	cases := map[string]bool{ // url → ok
		"https://toncenter.com": true,
		"http://localhost:8080": true,
		"http://127.0.0.1:8080": true,
		"http://toncenter.com":  false,
		"ftp://toncenter.com":   false,
		"https://":              false,
	}
	for u, ok := range cases {
		baseEnv(t)
		t.Setenv("TONCENTER_URL", u)
		_, err := Load()
		if ok && err != nil {
			t.Errorf("%s: unexpected error %v", u, err)
		}
		if !ok && (err == nil || !strings.Contains(err.Error(), "TONCENTER_URL")) {
			t.Errorf("%s: want TONCENTER_URL error, got %v", u, err)
		}
	}
}

func TestRabbitUserAndMetricsAddr(t *testing.T) {
	baseEnv(t)
	t.Setenv("METRICS_HOST", "10.0.0.5")
	t.Setenv("METRICS_PORT", "9100")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RabbitUser() != "chain-svc" {
		t.Errorf("RabbitUser = %q", cfg.RabbitUser())
	}
	if cfg.MetricsAddr() != "10.0.0.5:9100" {
		t.Errorf("MetricsAddr = %q", cfg.MetricsAddr())
	}
	if cfg.MaxMessageBytes != 64*1024 {
		t.Errorf("MaxMessageBytes = %d", cfg.MaxMessageBytes)
	}

	cfg.RabbitURL = "amqp://rabbit:5672/"
	if cfg.RabbitUser() != "guest" {
		t.Errorf("RabbitUser without credentials = %q, want guest", cfg.RabbitUser())
	}
}

func TestSafetyChecks(t *testing.T) {
	baseEnv(t)
	t.Setenv("TON_WALLET_ADDRESS", "EQnot-an-address")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "TON_WALLET_ADDRESS") {
		t.Errorf("bad wallet address: got %v", err)
	}

	baseEnv(t)
	t.Setenv("SIGNER_RABBIT_USER", "")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "SIGNER_RABBIT_USER") {
		t.Errorf("missing signer user: got %v", err)
	}

	baseEnv(t)
	t.Setenv("TON_CLIENT", "stub")
	t.Setenv("TONCENTER_URL", "https://toncenter.com")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "stub") {
		t.Errorf("stub on mainnet: got %v", err)
	}

	baseEnv(t)
	t.Setenv("AMQP_SINGLE_ACTIVE_CONSUMER", "maybe")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "AMQP_SINGLE_ACTIVE_CONSUMER") {
		t.Errorf("bad bool: got %v", err)
	}
}
