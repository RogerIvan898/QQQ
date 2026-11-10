// Package store — хранилище сервиса в MySQL: ключи идемпотентности и
// история выводов.
package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
)

//go:embed schema.sql
var schema string

// Статусы вывода.
const (
	StatusSigned    = "signed"    // подписан, ещё не отправлен в сеть
	StatusSent      = "sent"      // принят нодой, ждём включения в блок
	StatusConfirmed = "confirmed" // транзакция в блоке
	StatusFailed    = "failed"    // окончательно не прошёл
)

// queryTimeout — таймаут одного запроса для методов без ctx (Seen/Mark).
const queryTimeout = 3 * time.Second

// Open подключается к MySQL, проверяет соединение и применяет схему.
// В DSN принудительно включаются parseTime и UTC.
func Open(ctx context.Context, dsn string, maxOpen int) (*sql.DB, error) {
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse MYSQL_DSN: %w", err)
	}
	cfg.ParseTime = true
	cfg.Loc = time.UTC
	if cfg.Params == nil {
		cfg.Params = map[string]string{}
	}
	cfg.Params["time_zone"] = "'+00:00'"

	connector, err := mysql.NewConnector(cfg)
	if err != nil {
		return nil, fmt.Errorf("mysql connector: %w", err)
	}
	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxOpen)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	// MySQL в compose может подниматься дольше сервиса — ждём с паузами.
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
		return nil, fmt.Errorf("mysql ping: %w", pingErr)
	}

	if err := migrate(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func migrate(ctx context.Context, db *sql.DB) error {
	for _, stmt := range strings.Split(schema, ";") {
		if !hasSQL(stmt) {
			continue
		}
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("apply schema: %w", err)
		}
	}
	return nil
}

// hasSQL — есть ли в фрагменте что-то кроме комментариев и пробелов.
func hasSQL(stmt string) bool {
	for _, line := range strings.Split(stmt, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "--") {
			return true
		}
	}
	return false
}

// dbErr помечает ошибку БД как временную: недоступность MySQL —
// повод повторить обработку, а не выбрасывать сообщение в DLQ.
func dbErr(op string, err error) error {
	return amqp.Transient(fmt.Errorf("mysql %s: %w", op, err))
}

// ---------- идемпотентность ----------

// Idempotency — amqp.IdempotencyStore поверх MySQL: общий для всех реплик
// и переживает рестарт.
//
// Интерфейс не возвращает ошибок, поэтому при недоступной БД Seen
// отвечает false (сообщение будет обработано). Это безопасно: от повторной
// подписи и отправки защищает таблица withdrawals по request_id.
type Idempotency struct {
	db  *sql.DB
	ttl time.Duration
	log *zap.Logger
}

// NewIdempotency создаёт хранилище с заданным TTL записи.
func NewIdempotency(db *sql.DB, ttl time.Duration, log *zap.Logger) *Idempotency {
	return &Idempotency{db: db, ttl: ttl, log: log.Named("idempotency")}
}

// Seen сообщает, обрабатывался ли messageID в пределах TTL.
func (s *Idempotency) Seen(messageID string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), queryTimeout)
	defer cancel()
	var one int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM processed_messages WHERE message_id = ? AND expires_at > UTC_TIMESTAMP(3)`,
		messageID).Scan(&one)
	switch {
	case err == nil:
		return true
	case errors.Is(err, sql.ErrNoRows):
		return false
	default:
		s.log.Error("idempotency check failed, processing anyway", zap.String("message_id", messageID), zap.Error(err))
		return false
	}
}

// Mark запоминает messageID на TTL.
func (s *Idempotency) Mark(messageID string) {
	ctx, cancel := context.WithTimeout(context.Background(), queryTimeout)
	defer cancel()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO processed_messages (message_id, expires_at) VALUES (?, ?)
		 ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)`,
		messageID, time.Now().UTC().Add(s.ttl))
	if err != nil {
		s.log.Error("idempotency mark failed", zap.String("message_id", messageID), zap.Error(err))
	}
}

// Run периодически удаляет просроченные ключи пачками.
func (s *Idempotency) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			qctx, cancel := context.WithTimeout(ctx, 30*time.Second)
			res, err := s.db.ExecContext(qctx,
				`DELETE FROM processed_messages WHERE expires_at <= UTC_TIMESTAMP(3) LIMIT 10000`)
			cancel()
			if err != nil {
				if ctx.Err() == nil {
					s.log.Warn("idempotency cleanup failed", zap.Error(err))
				}
				continue
			}
			n, _ := res.RowsAffected()
			s.log.Debug("idempotency cleanup", zap.Int64("removed", n))
		}
	}
}

// ---------- выводы ----------

// Withdrawal — строка таблицы withdrawals.
type Withdrawal struct {
	RequestID  string
	UserID     int64 // 0 — неизвестен
	AmountNano uint64
	Asset      string
	ToAddress  string
	Seqno      uint32
	BOC        string
	BOCHash    string
	Status     string
	MsgHash    string
	TxHash     string
	Error      string
	SentAt     time.Time // нулевое значение — не отправлялся
}

// BOCHash — sha256 от строки BOC в hex.
func BOCHash(boc string) string {
	sum := sha256.Sum256([]byte(boc))
	return hex.EncodeToString(sum[:])
}

// Withdrawals — репозиторий выводов.
type Withdrawals struct{ db *sql.DB }

// NewWithdrawals создаёт репозиторий.
func NewWithdrawals(db *sql.DB) *Withdrawals { return &Withdrawals{db: db} }

const withdrawalCols = `request_id, user_id, amount_nano, asset, to_address, seqno, boc, boc_hash,
	status, msg_hash, tx_hash, error, sent_at`

// Get возвращает вывод по request_id или nil, если его нет.
func (r *Withdrawals) Get(ctx context.Context, requestID string) (*Withdrawal, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+withdrawalCols+` FROM withdrawals WHERE request_id = ?`, requestID)
	w, err := scanWithdrawal(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, dbErr("get withdrawal", err)
	}
	return w, nil
}

// InsertSigned сохраняет подписанный вывод в статусе signed.
// false — строка с таким request_id уже есть (её нужно перечитать).
func (r *Withdrawals) InsertSigned(ctx context.Context, w Withdrawal) (bool, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT IGNORE INTO withdrawals
		   (request_id, user_id, amount_nano, asset, to_address, seqno, boc, boc_hash, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		w.RequestID, nullInt(w.UserID), nullUint(w.AmountNano), nullStr(w.Asset), nullStr(w.ToAddress),
		w.Seqno, w.BOC, BOCHash(w.BOC), StatusSigned)
	if err != nil {
		return false, dbErr("insert withdrawal", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, dbErr("insert withdrawal", err)
	}
	return n == 1, nil
}

// MaxSeqno — наибольший выданный seqno (0, если выводов не было).
func (r *Withdrawals) MaxSeqno(ctx context.Context) (uint32, error) {
	var v sql.NullInt64
	if err := r.db.QueryRowContext(ctx, `SELECT MAX(seqno) FROM withdrawals`).Scan(&v); err != nil {
		return 0, dbErr("max seqno", err)
	}
	return uint32(v.Int64), nil
}

// MarkSent переводит signed → sent. Повторный вызов для sent безопасен.
func (r *Withdrawals) MarkSent(ctx context.Context, requestID, msgHash string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE withdrawals SET status = ?, msg_hash = ?, sent_at = COALESCE(sent_at, UTC_TIMESTAMP(3))
		 WHERE request_id = ? AND status IN (?, ?)`,
		StatusSent, msgHash, requestID, StatusSigned, StatusSent)
	if err != nil {
		return dbErr("mark sent", err)
	}
	return nil
}

// MarkConfirmed переводит sent → confirmed.
func (r *Withdrawals) MarkConfirmed(ctx context.Context, requestID, txHash string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE withdrawals SET status = ?, tx_hash = ? WHERE request_id = ? AND status = ?`,
		StatusConfirmed, txHash, requestID, StatusSent)
	if err != nil {
		return dbErr("mark confirmed", err)
	}
	return nil
}

// MarkFailed переводит sent → failed.
func (r *Withdrawals) MarkFailed(ctx context.Context, requestID, txHash, reason string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE withdrawals SET status = ?, tx_hash = ?, error = ? WHERE request_id = ? AND status = ?`,
		StatusFailed, nullStr(txHash), reason, requestID, StatusSent)
	if err != nil {
		return dbErr("mark failed", err)
	}
	return nil
}

// ListSent — отправленные, но ещё не подтверждённые выводы (старые первыми).
func (r *Withdrawals) ListSent(ctx context.Context, limit int) ([]Withdrawal, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+withdrawalCols+` FROM withdrawals WHERE status = ? ORDER BY sent_at LIMIT ?`,
		StatusSent, limit)
	if err != nil {
		return nil, dbErr("list sent", err)
	}
	defer rows.Close()

	var out []Withdrawal
	for rows.Next() {
		w, err := scanWithdrawal(rows)
		if err != nil {
			return nil, dbErr("scan withdrawal", err)
		}
		out = append(out, *w)
	}
	if err := rows.Err(); err != nil {
		return nil, dbErr("list sent", err)
	}
	return out, nil
}

type scanner interface{ Scan(dest ...any) error }

func scanWithdrawal(s scanner) (*Withdrawal, error) {
	var (
		w                                   Withdrawal
		userID                              sql.NullInt64
		amount                              sql.NullInt64
		asset, to, msgHash, txHash, errText sql.NullString
		sentAt                              sql.NullTime
	)
	if err := s.Scan(&w.RequestID, &userID, &amount, &asset, &to, &w.Seqno, &w.BOC, &w.BOCHash,
		&w.Status, &msgHash, &txHash, &errText, &sentAt); err != nil {
		return nil, err
	}
	w.UserID = userID.Int64
	w.AmountNano = uint64(amount.Int64)
	w.Asset, w.ToAddress = asset.String, to.String
	w.MsgHash, w.TxHash, w.Error = msgHash.String, txHash.String, errText.String
	if sentAt.Valid {
		w.SentAt = sentAt.Time
	}
	return &w, nil
}

func nullStr(s string) sql.NullString { return sql.NullString{String: s, Valid: s != ""} }
func nullInt(v int64) sql.NullInt64   { return sql.NullInt64{Int64: v, Valid: v != 0} }
func nullUint(v uint64) any {
	if v == 0 {
		return nil
	}
	return v
}
