// Package failure классифицирует ошибки на временные (стоит повторить) и
// постоянные (повтор не поможет). Пакет не зависит от транспорта и хранилища:
// им пользуются сеть TON, PostgreSQL, RabbitMQ и бизнес-логика.
package failure

import (
	"context"
	"errors"
	"net"
)

// permanentError помечает ошибку как постоянную: повтор не поможет
// (невалидный JSON, неизвестный актив, неверный адрес и т.п.).
type permanentError struct{ err error }

func (e *permanentError) Error() string { return e.err.Error() }
func (e *permanentError) Unwrap() error { return e.err }

// transientError помечает ошибку как временную (сеть, таймаут,
// недоступность внешнего API).
type transientError struct{ err error }

func (e *transientError) Error() string { return e.err.Error() }
func (e *transientError) Unwrap() error { return e.err }

// Permanent оборачивает err как постоянную ошибку.
func Permanent(err error) error {
	if err == nil {
		return nil
	}
	return &permanentError{err: err}
}

// Transient оборачивает err как временную ошибку.
func Transient(err error) error {
	if err == nil {
		return nil
	}
	return &transientError{err: err}
}

// IsPermanent сообщает, помечена ли ошибка как постоянная.
func IsPermanent(err error) bool {
	var p *permanentError
	return errors.As(err, &p)
}

// transienter реализуют ошибки, которые сами знают, временные ли они
// (например, транспортные ошибки брокера).
type transienter interface{ Transient() bool }

// IsTransient решает, стоит ли повторять операцию.
//
// Временными считаются: явно помеченные Transient, ошибки с методом
// Transient() bool, вернувшим true, таймауты контекста и сетевые ошибки.
// Явная пометка Permanent важнее любой эвристики.
//
// Всё неизвестное по умолчанию считается ПОСТОЯННЫМ: для денежных операций
// безопаснее отправить сообщение на ручной разбор, чем крутить повтор
// с непредсказуемым эффектом.
func IsTransient(err error) bool {
	if err == nil || IsPermanent(err) {
		return false
	}

	var t *transientError
	if errors.As(err, &t) {
		return true
	}

	var tr transienter
	if errors.As(err, &tr) && tr.Transient() {
		return true
	}

	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	var ne net.Error
	return errors.As(err, &ne)
}
