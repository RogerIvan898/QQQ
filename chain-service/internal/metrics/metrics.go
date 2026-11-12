// Package metrics описывает Prometheus-метрики сервиса и HTTP-сервер
// с эндпоинтами /metrics, /healthz и /readyz.
package metrics

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

// Статусы публикации для chain_publish_total.
const (
	PublishAck      = "ack"
	PublishNack     = "nack"
	PublishReturned = "returned"
	PublishTimeout  = "timeout"
	PublishError    = "error"
)

// Статусы обработки для chain_consume_total.
const (
	ConsumeOK        = "ok"
	ConsumeDuplicate = "duplicate"
	ConsumeRetry     = "retry"
	ConsumeDLQ       = "dlq"
	ConsumeRequeued  = "requeued"
	ConsumeAckError  = "ack_error"
	ConsumeNackError = "nack_error"
)

// Metrics — набор метрик сервиса. Используется собственный реестр, а не
// глобальный prometheus.DefaultRegisterer: так метрики не смешиваются с
// чужими и тесты могут создавать независимые экземпляры.
type Metrics struct {
	reg *prometheus.Registry

	PublishTotal    *prometheus.CounterVec   // chain_publish_total{queue,status}
	ConsumeTotal    *prometheus.CounterVec   // chain_consume_total{queue,status}
	RetryTotal      *prometheus.CounterVec   // chain_retry_total{queue}
	DLQTotal        *prometheus.CounterVec   // chain_dlq_total{queue}
	ConnectionUp    prometheus.Gauge         // chain_connection_up
	ReconnectTotal  prometheus.Counter       // chain_reconnect_total
	HandlerDuration *prometheus.HistogramVec // chain_handler_duration_seconds{queue}
	PublishDuration *prometheus.HistogramVec // chain_publish_duration_seconds{queue}

	BroadcastAttempt prometheus.Gauge     // chain_broadcast_attempt
	WithdrawalsStale prometheus.Gauge     // chain_withdrawals_stale
	LeaderLocks      *prometheus.GaugeVec // chain_leader_lock{component}
}

// New создаёт и регистрирует все метрики.
func New() *Metrics {
	reg := prometheus.NewRegistry()
	m := &Metrics{
		reg: reg,
		PublishTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "chain_publish_total",
			Help: "Публикации в RabbitMQ по очереди (routing key) и итогу подтверждения.",
		}, []string{"queue", "status"}),
		ConsumeTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "chain_consume_total",
			Help: "Обработанные входящие сообщения по очереди и итогу.",
		}, []string{"queue", "status"}),
		RetryTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "chain_retry_total",
			Help: "Сообщения, отправленные на повторную попытку через delay-очередь.",
		}, []string{"queue"}),
		DLQTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "chain_dlq_total",
			Help: "Сообщения, отправленные в dead-letter очередь.",
		}, []string{"queue"}),
		ConnectionUp: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "chain_connection_up",
			Help: "1 — соединение с RabbitMQ установлено и топология объявлена, 0 — нет.",
		}),
		ReconnectTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "chain_reconnect_total",
			Help: "Сколько раз соединение с RabbitMQ было потеряно.",
		}),
		HandlerDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "chain_handler_duration_seconds",
			Help:    "Время обработки одного сообщения обработчиком.",
			Buckets: prometheus.DefBuckets,
		}, []string{"queue"}),
		PublishDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "chain_publish_duration_seconds",
			Help:    "Время от публикации до подтверждения брокером.",
			Buckets: []float64{.001, .0025, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5},
		}, []string{"queue"}),
		BroadcastAttempt: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "chain_broadcast_attempt",
			Help: "Номер попытки отправки текущего вывода; 0 — очередь не стоит. Алерт: >= 10.",
		}),
		WithdrawalsStale: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "chain_withdrawals_stale",
			Help: "Отправленные выводы без подтверждения дольше CONFIRM_TIMEOUT: нужен ручной разбор. Алерт: > 0.",
		}),
		LeaderLocks: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "chain_leader_lock",
			Help: "1 — экземпляр держит блокировку компонента и работает, 0 — ждёт.",
		}, []string{"component"}),
	}

	reg.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
		m.PublishTotal, m.ConsumeTotal, m.RetryTotal, m.DLQTotal,
		m.ConnectionUp, m.ReconnectTotal, m.HandlerDuration, m.PublishDuration,
		m.BroadcastAttempt, m.WithdrawalsStale, m.LeaderLocks,
	)
	return m
}

// Registry возвращает реестр метрик.
func (m *Metrics) Registry() *prometheus.Registry { return m.reg }

// Server — HTTP-сервер метрик и health-проверок.
type Server struct {
	srv *http.Server
	log *zap.Logger
}

// NewServer собирает HTTP-сервер:
//   - /metrics — Prometheus;
//   - /healthz — liveness: процесс жив и отвечает;
//   - /readyz  — readiness: все проверки ready проходят (RabbitMQ, PostgreSQL).
func NewServer(addr string, m *Metrics, ready func(ctx context.Context) error, log *zap.Logger) *Server {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(m.reg, promhttp.HandlerOpts{Registry: m.reg}))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := ready(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(err.Error() + "\n"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})

	return &Server{
		srv: &http.Server{
			Addr:              addr,
			Handler:           mux,
			ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout:       10 * time.Second,
			WriteTimeout:      10 * time.Second,
			IdleTimeout:       60 * time.Second,
		},
		log: log,
	}
}

// Start занимает порт синхронно (чтобы ошибка «порт занят» всплыла сразу)
// и обслуживает запросы в отдельной горутине. Ошибка работы сервера
// отправляется в errCh.
func (s *Server) Start(errCh chan<- error) error {
	ln, err := net.Listen("tcp", s.srv.Addr)
	if err != nil {
		return err
	}
	s.log.Info("metrics server listening", zap.String("addr", ln.Addr().String()))
	go func() {
		if err := s.srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	return nil
}

// Shutdown корректно останавливает HTTP-сервер.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.srv.Shutdown(ctx)
}
