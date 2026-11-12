package withdrawal

import (
	"context"
	"encoding/json"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
	"gitlab.com/company-group7340831/poker/chain-service/internal/events"
	"gitlab.com/company-group7340831/poker/chain-service/internal/failure"
)

// ResultPublisher публикует WITHDRAW_RESULT. message_id детерминирован от
// request_id и статуса: повторная публикация того же итога — дубль, который
// получатель отбросит.
type ResultPublisher struct {
	pub        events.Publisher
	exchange   string
	routingKey string
}

// NewResultPublisher создаёт публикатор результатов.
func NewResultPublisher(pub events.Publisher, exchange, routingKey string) *ResultPublisher {
	return &ResultPublisher{pub: pub, exchange: exchange, routingKey: routingKey}
}

// Publish отправляет результат и ждёт подтверждения брокера.
func (p *ResultPublisher) Publish(ctx context.Context, res Result) (string, error) {
	body, err := json.Marshal(res)
	if err != nil {
		return "", failure.Permanent(err)
	}
	id := events.DeterministicID(events.WithdrawResult+":"+string(res.Status), res.RequestID)
	err = p.pub.Publish(ctx, amqp.Message{
		Exchange:      p.exchange,
		RoutingKey:    p.routingKey,
		MessageID:     id,
		Type:          events.WithdrawResult,
		CorrelationID: res.RequestID,
		Body:          body,
	})
	return id, err
}
