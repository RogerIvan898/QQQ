// Package config читает конфигурацию сервиса из переменных окружения.
//
// Все адреса, порты, имена exchange и очередей задаются только через env;
// в коде есть лишь безопасные значения по умолчанию для имён очередей,
// которые можно переопределить. URL брокера обязателен.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Mode — режим работы сервиса.
type Mode string

const (
	// ModeConsumer — только обработка withdrawals → withdrawals.signed
	// (плюс приём подтверждений из withdrawals.result).
	ModeConsumer Mode = "consumer"
	// ModeWatcher — только наблюдение за TON и публикация событий в deposits.
	ModeWatcher Mode = "watcher"
	// ModeBroadcaster — withdrawals.signed → отправка BOC в TON →
	// withdrawals.result (sent / confirmed / failed).
	ModeBroadcaster Mode = "broadcaster"
	// ModeAll — все режимы в одном процессе, в независимых горутинах
	// (удобно локально; в продакшене режимы лучше разносить по контейнерам).
	ModeAll Mode = "all"
)

// Consumes сообщает, нужно ли запускать подпись выводов и приём результатов.
func (m Mode) Consumes() bool { return m == ModeConsumer || m == ModeAll }

// Watches сообщает, нужно ли запускать наблюдатель депозитов.
func (m Mode) Watches() bool { return m == ModeWatcher || m == ModeAll }

// Broadcasts сообщает, нужно ли запускать отправку транзакций в сеть.
func (m Mode) Broadcasts() bool { return m == ModeBroadcaster || m == ModeAll }

// NeedsDB — режимы, которым нужна MySQL (история выводов, курсор watcher).
// Нужна всем режимам; оставлено функцией на случай новых режимов без БД.
func (m Mode) NeedsDB() bool { return m.Consumes() || m.Broadcasts() || m.Watches() }

// UsesTON — режимы, которые ходят в сеть TON.
func (m Mode) UsesTON() bool { return m.Broadcasts() || m.Watches() }

// Config — полная конфигурация сервиса.
type Config struct {
	Mode Mode

	// RabbitMQ
	RabbitURL    string        // RABBITMQ_URL (обязательно)
	Heartbeat    time.Duration // AMQP_HEARTBEAT
	Exchange     string        // AMQP_EXCHANGE
	ExchangeType string        // AMQP_EXCHANGE_TYPE: direct | topic
	QueueType    string        // AMQP_QUEUE_TYPE: quorum | classic

	// Имена очередей
	QueueWithdrawals       string // QUEUE_WITHDRAWALS
	QueueWithdrawalsSigned string // QUEUE_WITHDRAWALS_SIGNED
	QueueWithdrawalsResult string // QUEUE_WITHDRAWALS_RESULT
	QueueDeposits          string // QUEUE_DEPOSITS

	// Консьюмер
	PrefetchCount  int           // PREFETCH_COUNT
	Workers        int           // CONSUMER_WORKERS (по умолчанию = PREFETCH_COUNT)
	MaxRetries     int           // MAX_RETRIES
	RetryBaseDelay time.Duration // RETRY_BASE_DELAY: задержка первой попытки, далее ×2
	HandlerTimeout time.Duration // HANDLER_TIMEOUT

	// Паблишер
	PublishTimeout time.Duration // PUBLISH_TIMEOUT: ожидание ack от брокера

	// Переподключение
	ReconnectInitialDelay time.Duration // RECONNECT_INITIAL_DELAY
	ReconnectMaxDelay     time.Duration // RECONNECT_MAX_DELAY

	// Идемпотентность
	IdempotencyTTL             time.Duration // IDEMPOTENCY_TTL
	IdempotencyCleanupInterval time.Duration // IDEMPOTENCY_CLEANUP_INTERVAL

	// Наблюдатель депозитов
	WatcherPollInterval time.Duration // WATCHER_POLL_INTERVAL
	WatcherBatchSize    int           // WATCHER_BATCH_SIZE
	WatcherStartLT      uint64        // WATCHER_START_LT
	DepositAddress      string        // TON_DEPOSIT_ADDRESS: кошелёк, на который приходят депозиты

	// Подпись транзакций
	AllowStubSigner bool // ALLOW_STUB_SIGNER

	// MySQL
	MySQLDSN          string // MYSQL_DSN
	MySQLMaxOpenConns int    // MYSQL_MAX_OPEN_CONNS

	// Сеть TON
	TONClient        string        // TON_CLIENT: toncenter | stub
	ToncenterURL     string        // TONCENTER_URL
	ToncenterAPIKey  string        // TONCENTER_API_KEY (пусто — без ключа, лимит ~1 rps)
	ToncenterRPS     float64       // TONCENTER_RPS
	ToncenterTimeout time.Duration // TONCENTER_TIMEOUT

	// Broadcaster: ожидание подтверждений
	ConfirmPollInterval time.Duration // CONFIRM_POLL_INTERVAL
	ConfirmTimeout      time.Duration // CONFIRM_TIMEOUT
	ConfirmBatchSize    int           // CONFIRM_BATCH_SIZE

	// Прочее
	MetricsPort     int           // METRICS_PORT
	LogLevel        string        // LOG_LEVEL
	ShutdownTimeout time.Duration // SHUTDOWN_TIMEOUT
}

// Load читает конфигурацию из окружения и валидирует её.
// Все ошибки собираются и возвращаются разом, чтобы не чинить env по одной.
func Load() (*Config, error) {
	r := &reader{}

	cfg := &Config{
		Mode: Mode(strings.ToLower(r.str("MODE", string(ModeAll)))),

		RabbitURL:    r.str("RABBITMQ_URL", ""),
		Heartbeat:    r.duration("AMQP_HEARTBEAT", 10*time.Second),
		Exchange:     r.str("AMQP_EXCHANGE", "core.events"),
		ExchangeType: strings.ToLower(r.str("AMQP_EXCHANGE_TYPE", "direct")),
		QueueType:    strings.ToLower(r.str("AMQP_QUEUE_TYPE", "quorum")),

		QueueWithdrawals:       r.str("QUEUE_WITHDRAWALS", "withdrawals"),
		QueueWithdrawalsSigned: r.str("QUEUE_WITHDRAWALS_SIGNED", "withdrawals.signed"),
		QueueWithdrawalsResult: r.str("QUEUE_WITHDRAWALS_RESULT", "withdrawals.result"),
		QueueDeposits:          r.str("QUEUE_DEPOSITS", "deposits"),

		PrefetchCount:  r.int("PREFETCH_COUNT", 10),
		MaxRetries:     r.int("MAX_RETRIES", 3),
		RetryBaseDelay: r.duration("RETRY_BASE_DELAY", 5*time.Second),
		HandlerTimeout: r.duration("HANDLER_TIMEOUT", 30*time.Second),

		PublishTimeout: r.duration("PUBLISH_TIMEOUT", 5*time.Second),

		ReconnectInitialDelay: r.duration("RECONNECT_INITIAL_DELAY", time.Second),
		ReconnectMaxDelay:     r.duration("RECONNECT_MAX_DELAY", 30*time.Second),

		IdempotencyTTL:             r.duration("IDEMPOTENCY_TTL", 24*time.Hour),
		IdempotencyCleanupInterval: r.duration("IDEMPOTENCY_CLEANUP_INTERVAL", 10*time.Minute),

		WatcherPollInterval: r.duration("WATCHER_POLL_INTERVAL", 10*time.Second),
		WatcherBatchSize:    r.int("WATCHER_BATCH_SIZE", 100),
		WatcherStartLT:      r.uint64("WATCHER_START_LT", 0),
		DepositAddress:      r.str("TON_DEPOSIT_ADDRESS", ""),

		AllowStubSigner: r.bool("ALLOW_STUB_SIGNER", false),

		MySQLDSN:          r.str("MYSQL_DSN", ""),
		MySQLMaxOpenConns: r.int("MYSQL_MAX_OPEN_CONNS", 10),

		TONClient:        strings.ToLower(r.str("TON_CLIENT", "toncenter")),
		ToncenterURL:     strings.TrimRight(r.str("TONCENTER_URL", "https://testnet.toncenter.com"), "/"),
		ToncenterAPIKey:  r.str("TONCENTER_API_KEY", ""),
		ToncenterRPS:     r.float("TONCENTER_RPS", 1),
		ToncenterTimeout: r.duration("TONCENTER_TIMEOUT", 10*time.Second),

		ConfirmPollInterval: r.duration("CONFIRM_POLL_INTERVAL", 5*time.Second),
		ConfirmTimeout:      r.duration("CONFIRM_TIMEOUT", 15*time.Minute),
		ConfirmBatchSize:    r.int("CONFIRM_BATCH_SIZE", 50),

		MetricsPort:     r.int("METRICS_PORT", 9090),
		LogLevel:        strings.ToLower(r.str("LOG_LEVEL", "info")),
		ShutdownTimeout: r.duration("SHUTDOWN_TIMEOUT", 30*time.Second),
	}
	// По умолчанию воркеров столько же, сколько prefetch: каждое
	// предвыбранное сообщение сразу уходит в обработку.
	cfg.Workers = r.int("CONSUMER_WORKERS", cfg.PrefetchCount)

	if err := r.err(); err != nil {
		return nil, err
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// MetricsAddr — адрес HTTP-сервера метрик и health-эндпоинтов.
func (c *Config) MetricsAddr() string { return fmt.Sprintf(":%d", c.MetricsPort) }

// RedactedRabbitURL — URL брокера без пароля, пригодный для логов.
func (c *Config) RedactedRabbitURL() string {
	u, err := url.Parse(c.RabbitURL)
	if err != nil {
		return "<invalid url>"
	}
	return u.Redacted()
}

func (c *Config) validate() error {
	var errs []error
	add := func(format string, args ...any) { errs = append(errs, fmt.Errorf(format, args...)) }

	switch c.Mode {
	case ModeConsumer, ModeWatcher, ModeBroadcaster, ModeAll:
	default:
		add("MODE: ожидается consumer|watcher|broadcaster|all, получено %q", c.Mode)
	}

	if c.Mode.NeedsDB() && c.MySQLDSN == "" {
		add("MYSQL_DSN: обязательная переменная")
	}
	if c.MySQLMaxOpenConns < 1 {
		add("MYSQL_MAX_OPEN_CONNS: должно быть >= 1")
	}
	if c.Mode.Watches() && c.TONClient == "toncenter" && c.DepositAddress == "" {
		add("TON_DEPOSIT_ADDRESS: обязательна для watcher с TON_CLIENT=toncenter")
	}
	if c.Mode.UsesTON() {
		switch c.TONClient {
		case "stub":
		case "toncenter":
			if u, err := url.Parse(c.ToncenterURL); err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
				add("TONCENTER_URL: ожидается http(s) URL")
			}
		default:
			add("TON_CLIENT: ожидается toncenter|stub, получено %q", c.TONClient)
		}
		if c.ToncenterRPS <= 0 {
			add("TONCENTER_RPS: должно быть > 0")
		}
		if c.ConfirmBatchSize < 1 {
			add("CONFIRM_BATCH_SIZE: должно быть >= 1")
		}
	}

	if c.RabbitURL == "" {
		add("RABBITMQ_URL: обязательная переменная")
	} else if u, err := url.Parse(c.RabbitURL); err != nil || (u.Scheme != "amqp" && u.Scheme != "amqps") {
		add("RABBITMQ_URL: ожидается amqp:// или amqps:// URL")
	}

	if c.Exchange == "" {
		add("AMQP_EXCHANGE: не может быть пустым")
	}
	if c.ExchangeType != "direct" && c.ExchangeType != "topic" {
		add("AMQP_EXCHANGE_TYPE: ожидается direct|topic, получено %q", c.ExchangeType)
	}
	if c.QueueType != "quorum" && c.QueueType != "classic" {
		add("AMQP_QUEUE_TYPE: ожидается quorum|classic, получено %q", c.QueueType)
	}

	queues := map[string]string{
		"QUEUE_WITHDRAWALS":        c.QueueWithdrawals,
		"QUEUE_WITHDRAWALS_SIGNED": c.QueueWithdrawalsSigned,
		"QUEUE_WITHDRAWALS_RESULT": c.QueueWithdrawalsResult,
		"QUEUE_DEPOSITS":           c.QueueDeposits,
	}
	seen := map[string]string{}
	for env, name := range queues {
		if name == "" {
			add("%s: не может быть пустым", env)
			continue
		}
		if other, dup := seen[name]; dup {
			add("%s и %s указывают на одну очередь %q", env, other, name)
		}
		seen[name] = env
	}

	if c.PrefetchCount < 1 || c.PrefetchCount > 65535 {
		add("PREFETCH_COUNT: ожидается 1..65535, получено %d", c.PrefetchCount)
	}
	if c.Workers < 1 {
		add("CONSUMER_WORKERS: должно быть >= 1, получено %d", c.Workers)
	}
	if c.MaxRetries < 0 || c.MaxRetries > 10 {
		add("MAX_RETRIES: ожидается 0..10, получено %d", c.MaxRetries)
	}
	if c.MetricsPort < 1 || c.MetricsPort > 65535 {
		add("METRICS_PORT: ожидается 1..65535, получено %d", c.MetricsPort)
	}
	if c.WatcherBatchSize < 1 {
		add("WATCHER_BATCH_SIZE: должно быть >= 1, получено %d", c.WatcherBatchSize)
	}

	positive := map[string]time.Duration{
		"RETRY_BASE_DELAY":             c.RetryBaseDelay,
		"HANDLER_TIMEOUT":              c.HandlerTimeout,
		"PUBLISH_TIMEOUT":              c.PublishTimeout,
		"RECONNECT_INITIAL_DELAY":      c.ReconnectInitialDelay,
		"RECONNECT_MAX_DELAY":          c.ReconnectMaxDelay,
		"IDEMPOTENCY_TTL":              c.IdempotencyTTL,
		"IDEMPOTENCY_CLEANUP_INTERVAL": c.IdempotencyCleanupInterval,
		"WATCHER_POLL_INTERVAL":        c.WatcherPollInterval,
		"SHUTDOWN_TIMEOUT":             c.ShutdownTimeout,
		"TONCENTER_TIMEOUT":            c.ToncenterTimeout,
		"CONFIRM_POLL_INTERVAL":        c.ConfirmPollInterval,
		"CONFIRM_TIMEOUT":              c.ConfirmTimeout,
	}
	for env, d := range positive {
		if d <= 0 {
			add("%s: должно быть > 0", env)
		}
	}
	if c.ReconnectMaxDelay < c.ReconnectInitialDelay {
		add("RECONNECT_MAX_DELAY должно быть >= RECONNECT_INITIAL_DELAY")
	}

	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		add("LOG_LEVEL: ожидается debug|info|warn|error, получено %q", c.LogLevel)
	}

	// Реальной подписи пока нет: без явного согласия сервис не стартует
	// в режиме, где он выпускает «подписанные» транзакции.
	if c.Mode.Consumes() && !c.AllowStubSigner {
		add("ALLOW_STUB_SIGNER: подключён только stub-подписант; для dev/stage задайте ALLOW_STUB_SIGNER=true")
	}

	return errors.Join(errs...)
}

// reader читает переменные окружения, накапливая ошибки парсинга.
type reader struct{ errs []error }

func (r *reader) err() error { return errors.Join(r.errs...) }

func (r *reader) str(key, def string) string {
	if v, ok := os.LookupEnv(key); ok {
		return strings.TrimSpace(v)
	}
	return def
}

func (r *reader) int(key string, def int) int {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return def
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil {
		r.errs = append(r.errs, fmt.Errorf("%s: ожидается целое число, получено %q", key, v))
		return def
	}
	return n
}

func (r *reader) uint64(key string, def uint64) uint64 {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return def
	}
	n, err := strconv.ParseUint(strings.TrimSpace(v), 10, 64)
	if err != nil {
		r.errs = append(r.errs, fmt.Errorf("%s: ожидается неотрицательное целое, получено %q", key, v))
		return def
	}
	return n
}

func (r *reader) float(key string, def float64) float64 {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return def
	}
	f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
	if err != nil {
		r.errs = append(r.errs, fmt.Errorf("%s: ожидается число, получено %q", key, v))
		return def
	}
	return f
}

func (r *reader) bool(key string, def bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return def
	}
	b, err := strconv.ParseBool(strings.TrimSpace(v))
	if err != nil {
		r.errs = append(r.errs, fmt.Errorf("%s: ожидается true|false, получено %q", key, v))
		return def
	}
	return b
}

func (r *reader) duration(key string, def time.Duration) time.Duration {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return def
	}
	d, err := time.ParseDuration(strings.TrimSpace(v))
	if err != nil {
		r.errs = append(r.errs, fmt.Errorf("%s: ожидается длительность вида 5s/1m, получено %q", key, v))
		return def
	}
	return d
}
