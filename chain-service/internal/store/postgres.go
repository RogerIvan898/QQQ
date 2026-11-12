// Package store — хранилище сервиса в PostgreSQL: ключи идемпотентности,
// история выводов и курсор наблюдателя депозитов.
package store

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"

	"gitlab.com/company-group7340831/poker/chain-service/internal/failure"
)

//go:embed schema.sql
var schema string

// queryTimeout — таймаут одного запроса для методов без ctx (Seen/Mark).
const queryTimeout = 3 * time.Second

// Open подключается к PostgreSQL, проверяет соединение и применяет схему.
// Сессия принудительно работает в UTC.
func Open(ctx context.Context, dsn string, maxOpen int) (*sql.DB, error) {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse POSTGRES_DSN: %w", err)
	}
	if cfg.RuntimeParams == nil {
		cfg.RuntimeParams = map[string]string{}
	}
	cfg.RuntimeParams["timezone"] = "UTC"

	db := stdlib.OpenDB(*cfg)
	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxOpen)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	// PostgreSQL в compose может подниматься дольше сервиса — ждём с паузами.
	var pingErr error
	for attempt := 1; attempt <= 10; attempt++ {
		pctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		pingErr = db.PingContext(pctx)
		cancel()
		if pingErr == nil {
			break
		}
		select {
		case <-ctx.Done():
			_ = db.Close()
			return nil, ctx.Err()
		case <-time.After(time.Duration(attempt) * time.Second):
		}
	}
	if pingErr != nil {
		_ = db.Close()
		return nil, fmt.Errorf("postgres ping: %w", pingErr)
	}

	if err := migrate(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

// migrate применяет схему одним вызовом простого протокола: PostgreSQL
// выполняет несколько операторов за раз, а IF NOT EXISTS делает повтор
// при каждом старте безопасным.
func migrate(ctx context.Context, db *sql.DB) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	defer conn.Close()

	err = conn.Raw(func(driverConn any) error {
		pc, ok := driverConn.(*stdlib.Conn)
		if !ok {
			return errors.New("unexpected driver connection type")
		}
		_, err := pc.Conn().PgConn().Exec(ctx, schema).ReadAll()
		return err
	})
	if err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	return nil
}

// dbErr помечает ошибку БД как временную: недоступность PostgreSQL —
// повод повторить обработку, а не выбрасывать сообщение в DLQ.
func dbErr(op string, err error) error {
	return failure.Transient(fmt.Errorf("postgres %s: %w", op, err))
}
