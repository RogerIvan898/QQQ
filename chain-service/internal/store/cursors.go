package store

import (
	"context"
	"database/sql"
	"errors"
)

// Cursors хранит позицию наблюдателя депозитов, чтобы после рестарта он
// продолжал с того же места, а не перечитывал историю кошелька.
type Cursors struct{ db *sql.DB }

// NewCursors создаёт репозиторий курсоров.
func NewCursors(db *sql.DB) *Cursors { return &Cursors{db: db} }

// Load возвращает сохранённый lt; ok=false — курсора ещё нет.
func (c *Cursors) Load(ctx context.Context, account string) (uint64, bool, error) {
	var lt int64
	err := c.db.QueryRowContext(ctx, `SELECT last_lt FROM watcher_cursors WHERE account = $1`, account).Scan(&lt)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, dbErr("load cursor", err)
	}
	return uint64(lt), true, nil
}

// Save сохраняет lt. Курсор только растёт: старое значение не перезапишет новое.
func (c *Cursors) Save(ctx context.Context, account string, lt uint64) error {
	_, err := c.db.ExecContext(ctx,
		`INSERT INTO watcher_cursors (account, last_lt) VALUES ($1, $2)
		 ON CONFLICT (account) DO UPDATE
		   SET last_lt = GREATEST(watcher_cursors.last_lt, EXCLUDED.last_lt), updated_at = now()`,
		account, int64(lt))
	if err != nil {
		return dbErr("save cursor", err)
	}
	return nil
}
