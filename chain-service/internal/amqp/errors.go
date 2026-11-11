package amqp

import (
	"context"
	"errors"
	"net"

	amqp091 "github.com/rabbitmq/amqp091-go"
)

// Ошибки уровня транспорта. Все они считаются временными (IsTransient):
// повторная попытка после переподключения имеет смысл.
var (
	ErrClientClosed    = errors.New("amqp: client closed")
	ErrPublisherClosed = errors.New("amqp: publisher closed")
	ErrChannelClosed   = errors.New("amqp: channel closed before confirm")
	ErrNacked          = errors.New("amqp: publish nacked by broker")
	ErrReturned        = errors.New("amqp: message returned by broker (unroutable)")
	ErrPublishTimeout  = errors.New("amqp: publish confirm timeout")
)

// permanentError помечает ошибку как постоянную: повтор не поможет
// (невалидный JSON, неизвестный актив, неверный адрес и т.п.).
// Такое сообщение сразу уходит в DLQ.
type permanentError struct{ err error }

func (e *permanentError) Error() string { return e.err.Error() }
func (e *permanentError) Unwrap() error { return e.err }

// transientError явно помечает ошибку как временную (сеть, таймаут,
// недоступность внешнего API). Такое сообщение уходит на повтор.
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

// IsTransient решает, стоит ли повторять обработку.
//
// Временными считаются: явно помеченные Transient, таймауты контекста,
// сетевые ошибки, ошибки брокера с флагом Recover и все транспортные
// ошибки этого пакета (nack, return, таймаут подтверждения, закрытый канал).
//
// Всё неизвестное по умолчанию считается ПОСТОЯННЫМ: для денежных операций
// безопаснее отправить сообщение в DLQ на ручной разбор, чем крутить
// повтор с непредсказуемым эффектом.
func IsTransient(err error) bool {
	if err == nil || IsPermanent(err) {
		return false
	}

	var t *transientError
	if errors.As(err, &t) {
		return true
	}

	switch {
	case errors.Is(err, context.DeadlineExceeded),
		errors.Is(err, ErrNacked),
		errors.Is(err, ErrReturned),
		errors.Is(err, ErrPublishTimeout),
		errors.Is(err, ErrChannelClosed),
		errors.Is(err, ErrClientClosed),
		errors.Is(err, ErrPublisherClosed),
		errors.Is(err, amqp091.ErrClosed):
		return true
	}

	var ne net.Error
	if errors.As(err, &ne) {
		return true
	}

	var ae *amqp091.Error
	if errors.As(err, &ae) {
		return ae.Recover || !ae.Server
	}

	return false
}
