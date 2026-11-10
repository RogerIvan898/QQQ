package config

import (
	"strings"
	"testing"
)

func baseEnv(t *testing.T) {
	t.Helper()
	t.Setenv("RABBITMQ_URL", "amqp://chain-svc:secret@rabbit:5672/")
	t.Setenv("MYSQL_DSN", "u:p@tcp(db:3306)/x")
	t.Setenv("TON_WALLET_ADDRESS", "EQhot")
	t.Setenv("TON_DEPOSIT_ADDRESS", "EQdep")
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
