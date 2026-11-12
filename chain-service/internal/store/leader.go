package store

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"hash/fnv"
	"time"

	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/schedule"
)

// Интервалы работы под блокировкой: как часто пытаться её взять и как
// часто проверять, что соединение с блокировкой живо.
const (
	lockRetryInterval = 5 * time.Second
	lockCheckInterval = 5 * time.Second
	lockCheckTimeout  = 3 * time.Second
)

// ErrLockLost — соединение, державшее блокировку, оборвалось. Другой
// экземпляр мог уже взять её, поэтому компонент остановлен.
var ErrLockLost = errors.New("advisory lock lost")

// LockKey — ключ advisory lock для имени компонента и его параметра
// (например, адреса кошелька).
func LockKey(parts ...string) int64 {
	h := fnv.New64a()
	for _, p := range parts {
		_, _ = h.Write([]byte(p))
		_, _ = h.Write([]byte{0})
	}
	return int64(h.Sum64())
}

// RunExclusive запускает fn, только когда этот процесс держит advisory lock
// key в PostgreSQL, то есть единственный экземпляр компонента во всём
// развёртывании. Пока блокировка занята другим процессом, ждёт.
//
// Блокировка живёт, пока живо соединение. Если проверка соединения не
// прошла, fn получает отменённый контекст, а RunExclusive возвращает
// ErrLockLost: сервис должен остановиться, а не работать вдвоём.
func RunExclusive(ctx context.Context, db *sql.DB, key int64, log *zap.Logger, onHeld func(bool), fn func(context.Context) error) error {
	if onHeld == nil {
		onHeld = func(bool) {}
	}
	defer onHeld(false)

	conn, err := acquire(ctx, db, key, log)
	if err != nil || conn == nil {
		return err // ctx отменён, пока ждали
	}
	defer func() {
		uctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), lockCheckTimeout)
		_, _ = conn.ExecContext(uctx, `SELECT pg_advisory_unlock($1)`, key)
		cancel()
		// Соединение не возвращаем в пул: если unlock не прошёл, блокировка
		// осталась бы висеть на чужом запросе. ErrBadConn закрывает его.
		_ = conn.Raw(func(any) error { return driver.ErrBadConn })
		_ = conn.Close()
	}()
	onHeld(true)

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	lost := make(chan struct{})
	go func() {
		schedule.Every(runCtx, lockCheckInterval, func() {
			cctx, ccancel := context.WithTimeout(runCtx, lockCheckTimeout)
			err := conn.PingContext(cctx)
			ccancel()
			if err != nil && runCtx.Err() == nil {
				log.Error("advisory lock connection lost, stopping component", zap.Error(err))
				close(lost)
				cancel()
			}
		})
	}()

	err = fn(runCtx)
	select {
	case <-lost:
		return ErrLockLost
	default:
		return err
	}
}

// acquire ждёт блокировку. nil-соединение без ошибки — ctx отменён.
func acquire(ctx context.Context, db *sql.DB, key int64, log *zap.Logger) (*sql.Conn, error) {
	waiting := false
	for {
		conn, err := tryLock(ctx, db, key)
		if conn != nil {
			if waiting {
				log.Info("advisory lock acquired")
			}
			return conn, nil
		}
		if err != nil {
			log.Warn("advisory lock attempt failed", zap.Error(err))
		} else if !waiting {
			log.Info("another instance holds the advisory lock, waiting")
			waiting = true
		}
		if !schedule.Sleep(ctx, lockRetryInterval) {
			return nil, nil
		}
	}
}

func tryLock(ctx context.Context, db *sql.DB, key int64) (*sql.Conn, error) {
	qctx, cancel := context.WithTimeout(ctx, lockCheckTimeout)
	defer cancel()
	conn, err := db.Conn(qctx)
	if err != nil {
		return nil, fmt.Errorf("postgres conn: %w", err)
	}
	var ok bool
	if err := conn.QueryRowContext(qctx, `SELECT pg_try_advisory_lock($1)`, key).Scan(&ok); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("pg_try_advisory_lock: %w", err)
	}
	if !ok {
		_ = conn.Close()
		return nil, nil
	}
	return conn, nil
}
