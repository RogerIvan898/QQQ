package amqp

import (
	"strconv"
	"strings"

	amqp091 "github.com/rabbitmq/amqp091-go"
)

// Имена заголовков сообщений.
const (
	// HeaderMessageID — UUID сообщения, ключ идемпотентности.
	HeaderMessageID = "message_id"
	// HeaderRetryCount — номер повторной попытки (0 — исходное сообщение).
	HeaderRetryCount = "x-retry-count"
	// HeaderLastError — текст последней ошибки (для разбора DLQ).
	HeaderLastError = "x-last-error"
	// HeaderOriginalQueue — очередь, из которой сообщение ушло на повтор.
	HeaderOriginalQueue = "x-original-queue"

	// ContentTypeJSON — тип содержимого всех сообщений сервиса.
	ContentTypeJSON = "application/json"
)

// MessageID достаёт идентификатор сообщения: сначала из заголовка
// message_id (основной контракт), затем из AMQP-свойства MessageId.
func MessageID(d amqp091.Delivery) string {
	if v, ok := d.Headers[HeaderMessageID]; ok {
		if s, ok := v.(string); ok && s != "" {
			return strings.TrimSpace(s)
		}
	}
	return strings.TrimSpace(d.MessageId)
}

// RetryCount возвращает значение x-retry-count. Отсутствующий или
// повреждённый заголовок трактуется как 0. Разные клиенты кодируют числа
// в AMQP-таблицах разными типами, поэтому поддерживаются все целые и строка.
func RetryCount(h amqp091.Table) int {
	v, ok := h[HeaderRetryCount]
	if !ok {
		return 0
	}
	var n int64
	switch x := v.(type) {
	case int:
		n = int64(x)
	case int8:
		n = int64(x)
	case int16:
		n = int64(x)
	case int32:
		n = int64(x)
	case int64:
		n = x
	case uint8:
		n = int64(x)
	case uint16:
		n = int64(x)
	case uint32:
		n = int64(x)
	case string:
		parsed, err := strconv.ParseInt(x, 10, 64)
		if err != nil {
			return 0
		}
		n = parsed
	default:
		return 0
	}
	if n < 0 {
		return 0
	}
	if n > 1<<20 {
		return 1 << 20
	}
	return int(n)
}

// retryHeaders копирует заголовки исходного сообщения для повторной
// публикации: проставляет новый x-retry-count и текст ошибки, а служебные
// x-death* (которые RabbitMQ добавляет при dead-lettering) убирает, чтобы
// они не разрастались от попытки к попытке.
func retryHeaders(src amqp091.Table, messageID string, attempt int, queue string, lastErr error) amqp091.Table {
	h := make(amqp091.Table, len(src)+4)
	for k, v := range src {
		if k == "x-death" || strings.HasPrefix(k, "x-first-death-") || strings.HasPrefix(k, "x-last-death-") {
			continue
		}
		h[k] = v
	}
	h[HeaderMessageID] = messageID
	h[HeaderRetryCount] = int32(attempt)
	h[HeaderOriginalQueue] = queue
	if lastErr != nil {
		h[HeaderLastError] = Truncate(lastErr.Error(), 512)
	}
	return h
}

// Truncate обрезает s до max байт, не разрезая UTF-8 символ.
func Truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	// Обрезка могла разрезать многобайтовый UTF-8 символ — убираем хвост.
	return strings.ToValidUTF8(s[:max], "")
}
