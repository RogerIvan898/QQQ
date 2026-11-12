// Package schedule — паузы и периодический запуск, прерываемые контекстом.
package schedule

import (
	"context"
	"time"
)

// Sleep ждёт d. false — ctx отменён раньше.
func Sleep(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// Every вызывает fn сразу и затем каждые interval, пока ctx не отменён.
// Начатый вызов fn дорабатывает до конца.
func Every(ctx context.Context, interval time.Duration, fn func()) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		fn()
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
