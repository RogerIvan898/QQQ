package withdrawal

// Signed — подписанная транзакция от сервиса подписи (очередь
// withdrawals.signed). Подпись, выдача seqno и защита от повторной подписи —
// на стороне сервиса подписи; chain-service только отправляет.
type Signed struct {
	RequestID string `json:"request_id"`
	BOC       string `json:"boc"`
	Seqno     uint32 `json:"seqno"`
}

// ResultStatus — итог вывода в сообщении WITHDRAW_RESULT.
type ResultStatus string

// Итоги вывода.
const (
	ResultSent      ResultStatus = "sent"      // отправлено в сеть, ждём включения в блок
	ResultConfirmed ResultStatus = "confirmed" // транзакция в блоке
	ResultFailed    ResultStatus = "failed"    // транзакция найдена, но прервана
)

// Result — результат вывода (очередь withdrawals.result).
type Result struct {
	RequestID string       `json:"request_id"`
	Status    ResultStatus `json:"status"`
	TxHash    string       `json:"tx_hash,omitempty"`
	Seqno     uint32       `json:"seqno,omitempty"`
	Error     string       `json:"error,omitempty"`
}
