package handler

// AssetTON — единственный поддерживаемый актив.
const AssetTON = "TON"

// WithdrawSigned — подписанная транзакция от сервиса подписи
// (очередь withdrawals.signed). Подпись, выдача seqno и защита от повторной
// подписи — на стороне сервиса подписи; chain-service только отправляет.
type WithdrawSigned struct {
	RequestID string `json:"request_id"`
	BOC       string `json:"boc"`
	Seqno     uint32 `json:"seqno"`
}

// Статусы результата вывода.
const (
	ResultSent      = "sent"      // отправлено в сеть, ждём включения в блок
	ResultConfirmed = "confirmed" // транзакция в блоке
	ResultFailed    = "failed"    // транзакция найдена, но прервана
)

// WithdrawResult — результат вывода (очередь withdrawals.result).
type WithdrawResult struct {
	RequestID string `json:"request_id"`
	Status    string `json:"status"`
	TxHash    string `json:"tx_hash,omitempty"`
	Seqno     uint32 `json:"seqno,omitempty"`
	Error     string `json:"error,omitempty"`
}
