// Package handler — бизнес-логика: отправка подписанных выводов в сеть,
// отслеживание подтверждений и наблюдение за депозитами.
package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	amqp091 "github.com/rabbitmq/amqp091-go"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
)

// Типы событий (AMQP-свойство type).
const (
	EventWithdrawSigned  = "WITHDRAW_SIGNED"
	EventWithdrawResult  = "WITHDRAW_RESULT"
	EventDepositDetected = "DEPOSIT_DETECTED"
)

// Publisher — минимальный интерфейс паблишера (для подмены в тестах).
type Publisher interface {
	Publish(ctx context.Context, msg amqp.Message) error
}

// idNamespace — пространство имён для детерминированных UUIDv5.
var idNamespace = uuid.NewSHA1(uuid.NameSpaceURL, []byte("chain-service.poker"))

// DeterministicID строит стабильный UUIDv5 из вида события и бизнес-ключа.
//
// Исходящие сообщения получают message_id, производный от бизнес-ключа
// (request_id, tx_hash), а не случайный: если сообщение придётся
// опубликовать повторно (повторная доставка входящего, рестарт после
// публикации, но до ack), получатель увидит тот же message_id и отбросит дубль.
func DeterministicID(kind, key string) string {
	return uuid.NewSHA1(idNamespace, []byte(kind+":"+key)).String()
}

// checkEnvelope проверяет content type и тип события, если они заданы.
func checkEnvelope(d amqp091.Delivery, wantType string) error {
	if ct := d.ContentType; ct != "" && !strings.HasPrefix(ct, amqp.ContentTypeJSON) {
		return fmt.Errorf("unexpected content type %q", ct)
	}
	if d.Type != "" && d.Type != wantType {
		return fmt.Errorf("unexpected event type %q, want %q", d.Type, wantType)
	}
	return nil
}

// decodeJSON разбирает тело сообщения в v. Неизвестные поля допускаются
// (совместимость при расширении контракта), мусор после объекта — нет.
func decodeJSON(body []byte, v any) error {
	dec := json.NewDecoder(bytes.NewReader(body))
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("decode json: %w", err)
	}
	if dec.More() {
		return errors.New("decode json: trailing data after object")
	}
	return nil
}

func validUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}
