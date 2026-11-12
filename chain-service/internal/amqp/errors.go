package amqp

import (
	"errors"

	amqp091 "github.com/rabbitmq/amqp091-go"

	"gitlab.com/company-group7340831/poker/chain-service/internal/failure"
)

// transportError — ошибка уровня транспорта. Все такие ошибки временные:
// повторная попытка после переподключения имеет смысл.
type transportError struct{ msg string }

func (e *transportError) Error() string   { return e.msg }
func (e *transportError) Transient() bool { return true }

// Ошибки уровня транспорта (failure.IsTransient считает их временными).
var (
	ErrClientClosed    error = &transportError{"amqp: client closed"}
	ErrPublisherClosed error = &transportError{"amqp: publisher closed"}
	ErrChannelClosed   error = &transportError{"amqp: channel closed before confirm"}
	ErrNacked          error = &transportError{"amqp: publish nacked by broker"}
	ErrReturned        error = &transportError{"amqp: message returned by broker (unroutable)"}
	ErrPublishTimeout  error = &transportError{"amqp: publish confirm timeout"}
)

// IsTransient дополняет failure.IsTransient ошибками библиотеки amqp091:
// закрытое соединение и ошибки брокера с флагом Recover.
func IsTransient(err error) bool {
	if failure.IsTransient(err) {
		return true
	}
	if err == nil || failure.IsPermanent(err) {
		return false
	}
	if errors.Is(err, amqp091.ErrClosed) {
		return true
	}
	var ae *amqp091.Error
	if errors.As(err, &ae) {
		return ae.Recover || !ae.Server
	}
	return false
}
