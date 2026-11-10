package ton

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"golang.org/x/time/rate"

	"gitlab.com/company-group7340831/poker/chain-service/internal/amqp"
)

// ToncenterConfig — параметры клиента toncenter.
type ToncenterConfig struct {
	BaseURL string        // https://toncenter.com или https://testnet.toncenter.com
	APIKey  string        // пусто — без ключа (публичный лимит ~1 запрос/с)
	RPS     float64       // собственный лимит запросов в секунду
	Timeout time.Duration // таймаут одного HTTP-запроса
}

// Toncenter — клиент toncenter API:
//   - POST /api/v2/sendBocReturnHash — отправка BOC;
//   - GET  /api/v3/transactionsByMessage — поиск транзакции по хэшу сообщения.
type Toncenter struct {
	cfg  ToncenterConfig
	http *http.Client
	lim  *rate.Limiter
}

// NewToncenter создаёт клиента.
func NewToncenter(cfg ToncenterConfig) *Toncenter {
	return &Toncenter{
		cfg:  cfg,
		http: &http.Client{Timeout: cfg.Timeout},
		lim:  rate.NewLimiter(rate.Limit(cfg.RPS), 1),
	}
}

// SendBoc отправляет BOC в сеть.
func (t *Toncenter) SendBoc(ctx context.Context, boc string) (string, error) {
	payload, err := json.Marshal(map[string]string{"boc": boc})
	if err != nil {
		return "", amqp.Permanent(err)
	}
	var resp struct {
		OK     bool   `json:"ok"`
		Error  string `json:"error"`
		Result struct {
			Hash     string `json:"hash"`
			HashNorm string `json:"hash_norm"`
		} `json:"result"`
	}
	if err := t.do(ctx, http.MethodPost, "/api/v2/sendBocReturnHash", payload, &resp); err != nil {
		return "", fmt.Errorf("sendBoc: %w", err)
	}
	if !resp.OK {
		return "", amqp.Transient(fmt.Errorf("sendBoc: %s", resp.Error))
	}
	// Храним хэш сообщения в том виде, в каком оно попадёт в блок: он
	// совпадает с in_msg.hash транзакции кошелька. Нормализованный — запасной.
	if resp.Result.Hash != "" {
		return resp.Result.Hash, nil
	}
	if resp.Result.HashNorm != "" {
		return resp.Result.HashNorm, nil
	}
	return "", amqp.Transient(errors.New("sendBoc: empty message hash in response"))
}

// FindTransaction ищет входящую транзакцию кошелька по хэшу сообщения.
func (t *Toncenter) FindTransaction(ctx context.Context, msgHash string) (*Tx, error) {
	q := url.Values{}
	q.Set("msg_hash", msgHash)
	q.Set("direction", "in")
	q.Set("limit", "1")

	var resp struct {
		Transactions []struct {
			Hash        string `json:"hash"`
			LT          string `json:"lt"`
			Description struct {
				Aborted   bool `json:"aborted"`
				ComputePh struct {
					Success  *bool `json:"success"`
					ExitCode int   `json:"exit_code"`
				} `json:"compute_ph"`
			} `json:"description"`
		} `json:"transactions"`
	}
	err := t.do(ctx, http.MethodGet, "/api/v3/transactionsByMessage?"+q.Encode(), nil, &resp)
	var he *HTTPError
	if errors.As(err, &he) && he.Status == http.StatusNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("transactionsByMessage: %w", err)
	}
	if len(resp.Transactions) == 0 {
		return nil, nil
	}

	tx := resp.Transactions[0]
	out := &Tx{Hash: tx.Hash, LT: tx.LT, Success: true}
	switch {
	case tx.Description.Aborted:
		out.Success, out.Reason = false, "transaction aborted"
	case tx.Description.ComputePh.Success != nil && !*tx.Description.ComputePh.Success:
		out.Success, out.Reason = false, fmt.Sprintf("compute phase failed, exit code %d", tx.Description.ComputePh.ExitCode)
	}
	return out, nil
}

// HTTPError — неуспешный ответ toncenter.
type HTTPError struct {
	Status int
	Body   string
}

func (e *HTTPError) Error() string { return fmt.Sprintf("toncenter HTTP %d: %s", e.Status, e.Body) }

// do выполняет запрос с учётом лимита и классифицирует ошибки.
func (t *Toncenter) do(ctx context.Context, method, path string, body []byte, out any) error {
	if err := t.lim.Wait(ctx); err != nil {
		return amqp.Transient(err)
	}

	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, t.cfg.BaseURL+path, rd)
	if err != nil {
		return amqp.Permanent(err)
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if t.cfg.APIKey != "" {
		req.Header.Set("X-API-Key", t.cfg.APIKey)
	}

	resp, err := t.http.Do(req)
	if err != nil {
		return amqp.Transient(err) // сеть, DNS, таймаут
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return amqp.Transient(err)
	}

	if resp.StatusCode != http.StatusOK {
		he := &HTTPError{Status: resp.StatusCode, Body: truncate(string(data), 300)}
		switch {
		case resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusUnprocessableEntity:
			// Битый запрос / BOC — повтор не поможет.
			return amqp.Permanent(he)
		default:
			// 401/403 (ключ), 404, 429 (лимит), 5xx. Отказ ноды принять
			// внешнее сообщение (например, seqno ещё не дошёл) toncenter
			// тоже отдаёт как 5xx — такой BOC может пройти чуть позже.
			return amqp.Transient(he)
		}
	}

	if err := json.Unmarshal(data, out); err != nil {
		return amqp.Transient(fmt.Errorf("decode response: %w", err))
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// FindTransactions одним запросом читает последние limit транзакций кошелька
// account и возвращает те, что порождены внешними сообщениями с хэшами из
// msgHashes (сверяются и hash, и hash_norm). Ключ результата — хэш из запроса.
func (t *Toncenter) FindTransactions(ctx context.Context, account string, msgHashes []string, limit int) (map[string]*Tx, error) {
	want := make(map[string]struct{}, len(msgHashes))
	for _, h := range msgHashes {
		want[h] = struct{}{}
	}

	q := url.Values{}
	q.Set("account", account)
	q.Set("sort", "desc")
	q.Set("limit", strconv.Itoa(limit))
	var resp struct {
		Transactions []toncenterTx `json:"transactions"`
	}
	if err := t.do(ctx, http.MethodGet, "/api/v3/transactions?"+q.Encode(), nil, &resp); err != nil {
		return nil, fmt.Errorf("transactions: %w", err)
	}

	out := make(map[string]*Tx)
	for _, tx := range resp.Transactions {
		in := tx.InMsg
		if in == nil || in.Source != nil { // нужны только внешние входящие (наши выводы)
			continue
		}
		for _, h := range []string{in.Hash, in.HashNorm} {
			if _, ok := want[h]; ok && h != "" {
				out[h] = txResult(tx)
			}
		}
	}
	return out, nil
}

func txResult(tx toncenterTx) *Tx {
	out := &Tx{Hash: tx.Hash, LT: tx.LT, Success: true}
	switch {
	case tx.Description.Aborted:
		out.Success, out.Reason = false, "transaction aborted"
	case tx.Description.ComputePh.Success != nil && !*tx.Description.ComputePh.Success:
		out.Success, out.Reason = false, "compute phase failed"
	}
	return out
}
