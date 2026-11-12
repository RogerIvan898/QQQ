package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"gitlab.com/company-group7340831/poker/chain-service/internal/withdrawal"
)

// Withdrawals — репозиторий выводов.
type Withdrawals struct{ db *sql.DB }

// NewWithdrawals создаёт репозиторий.
func NewWithdrawals(db *sql.DB) *Withdrawals { return &Withdrawals{db: db} }

const withdrawalCols = `request_id, user_id, amount_nano, asset, to_address, seqno, boc, boc_hash,
	status, msg_hash, tx_hash, error, sent_at`

// Get возвращает вывод по request_id или nil, если его нет.
func (r *Withdrawals) Get(ctx context.Context, requestID string) (*withdrawal.Withdrawal, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+withdrawalCols+` FROM withdrawals WHERE request_id = $1`, requestID)
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
func (r *Withdrawals) InsertSigned(ctx context.Context, w withdrawal.Withdrawal) (bool, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO withdrawals
		   (request_id, user_id, amount_nano, asset, to_address, seqno, boc, boc_hash, msg_hash, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 ON CONFLICT (request_id) DO NOTHING`,
		w.RequestID, nullInt(w.UserID), nullUint(w.AmountNano), nullStr(w.Asset), nullStr(w.ToAddress),
		int64(w.Seqno), w.BOC, withdrawal.BOCHash(w.BOC), nullStr(w.MsgHash), withdrawal.StatusSigned)
	if err != nil {
		return false, dbErr("insert withdrawal", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, dbErr("insert withdrawal", err)
	}
	return n == 1, nil
}

// MarkSent переводит signed → sent. Повторный вызов для sent безопасен.
func (r *Withdrawals) MarkSent(ctx context.Context, requestID, msgHash string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE withdrawals
		    SET status = $1, msg_hash = $2, sent_at = COALESCE(sent_at, now()), updated_at = now()
		  WHERE request_id = $3 AND status IN ($4, $5)`,
		withdrawal.StatusSent, msgHash, requestID, withdrawal.StatusSigned, withdrawal.StatusSent)
	if err != nil {
		return dbErr("mark sent", err)
	}
	return nil
}

// MarkConfirmed переводит sent → confirmed.
func (r *Withdrawals) MarkConfirmed(ctx context.Context, requestID, txHash string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE withdrawals SET status = $1, tx_hash = $2, updated_at = now()
		  WHERE request_id = $3 AND status = $4`,
		withdrawal.StatusConfirmed, txHash, requestID, withdrawal.StatusSent)
	if err != nil {
		return dbErr("mark confirmed", err)
	}
	return nil
}

// MarkFailed переводит sent → failed.
func (r *Withdrawals) MarkFailed(ctx context.Context, requestID, txHash, reason string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE withdrawals SET status = $1, tx_hash = $2, error = $3, updated_at = now()
		  WHERE request_id = $4 AND status = $5`,
		withdrawal.StatusFailed, nullStr(txHash), reason, requestID, withdrawal.StatusSent)
	if err != nil {
		return dbErr("mark failed", err)
	}
	return nil
}

// ListSent — свежие отправленные выводы (sent_at > sentAfter), старые первыми.
func (r *Withdrawals) ListSent(ctx context.Context, sentAfter time.Time, limit int) ([]withdrawal.Withdrawal, error) {
	return r.list(ctx, "list sent",
		`SELECT `+withdrawalCols+` FROM withdrawals
		 WHERE status = $1 AND sent_at > $2 ORDER BY sent_at LIMIT $3`,
		withdrawal.StatusSent, sentAfter.UTC(), limit)
}

// ListStale — зависшие выводы (sent_at <= sentBefore) по кругу: следующая
// страница после afterID в порядке request_id.
func (r *Withdrawals) ListStale(ctx context.Context, sentBefore time.Time, afterID string, limit int) ([]withdrawal.Withdrawal, error) {
	return r.list(ctx, "list stale",
		`SELECT `+withdrawalCols+` FROM withdrawals
		 WHERE status = $1 AND sent_at <= $2 AND request_id > $3 ORDER BY request_id LIMIT $4`,
		withdrawal.StatusSent, sentBefore.UTC(), afterID, limit)
}

// CountStale — число зависших выводов (sent_at <= sentBefore).
func (r *Withdrawals) CountStale(ctx context.Context, sentBefore time.Time) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT count(*) FROM withdrawals WHERE status = $1 AND sent_at <= $2`,
		withdrawal.StatusSent, sentBefore.UTC()).Scan(&n)
	if err != nil {
		return 0, dbErr("count stale", err)
	}
	return n, nil
}

func (r *Withdrawals) list(ctx context.Context, op, query string, args ...any) ([]withdrawal.Withdrawal, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, dbErr(op, err)
	}
	defer rows.Close()

	var out []withdrawal.Withdrawal
	for rows.Next() {
		w, err := scanWithdrawal(rows)
		if err != nil {
			return nil, dbErr(op, err)
		}
		out = append(out, *w)
	}
	if err := rows.Err(); err != nil {
		return nil, dbErr(op, err)
	}
	return out, nil
}

type scanner interface{ Scan(dest ...any) error }

func scanWithdrawal(s scanner) (*withdrawal.Withdrawal, error) {
	var (
		w                                   withdrawal.Withdrawal
		seqno                               int64
		userID                              sql.NullInt64
		amount                              sql.NullInt64
		asset, to, msgHash, txHash, errText sql.NullString
		sentAt                              sql.NullTime
	)
	if err := s.Scan(&w.RequestID, &userID, &amount, &asset, &to, &seqno, &w.BOC, &w.BOCHash,
		&w.Status, &msgHash, &txHash, &errText, &sentAt); err != nil {
		return nil, err
	}
	w.Seqno = uint32(seqno)
	w.UserID = userID.Int64
	w.AmountNano = uint64(amount.Int64)
	w.Asset, w.ToAddress = asset.String, to.String
	w.MsgHash, w.TxHash, w.Error = msgHash.String, txHash.String, errText.String
	if sentAt.Valid {
		w.SentAt = sentAt.Time.UTC()
	}
	return &w, nil
}

func nullStr(s string) sql.NullString { return sql.NullString{String: s, Valid: s != ""} }
func nullInt(v int64) sql.NullInt64   { return sql.NullInt64{Int64: v, Valid: v != 0} }
func nullUint(v uint64) any {
	if v == 0 {
		return nil
	}
	return int64(v)
}
