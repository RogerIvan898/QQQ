package ton

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

// Deposit — входящий перевод TON на кошелёк депозитов.
type Deposit struct {
	TxHash      string
	LT          uint64
	FromAddress string
	ToAddress   string
	AmountNano  uint64
	Comment     string // текстовый комментарий (мемо), по нему ядро находит пользователя
	Utime       int64  // время транзакции, unix
}

// DepositBatch — результат одного запроса: найденные депозиты и курсор.
// NextLT двигается по всем просмотренным транзакциям (в том числе по
// исходящим выводам и неуспешным), иначе пачка без депозитов читалась бы
// бесконечно.
type DepositBatch struct {
	Deposits []Deposit
	NextLT   uint64
	Full     bool // пачка заполнена — есть смысл сразу запросить следующую
}

// toncenterTx — нужные поля транзакции из /api/v3/transactions.
type toncenterTx struct {
	Hash        string `json:"hash"`
	LT          string `json:"lt"`
	Now         int64  `json:"now"`
	Description struct {
		Aborted   bool `json:"aborted"`
		ComputePh struct {
			Success  *bool `json:"success"`
			ExitCode int   `json:"exit_code"`
		} `json:"compute_ph"`
	} `json:"description"`
	InMsg *struct {
		Hash           string  `json:"hash"`
		HashNorm       string  `json:"hash_norm"`
		Source         *string `json:"source"` // null — внешнее сообщение (наш вывод)
		Destination    string  `json:"destination"`
		Value          *string `json:"value"`
		Bounced        bool    `json:"bounced"`
		MessageContent *struct {
			Decoded *struct {
				Type    string `json:"type"`
				Comment string `json:"comment"`
			} `json:"decoded"`
		} `json:"message_content"`
	} `json:"in_msg"`
}

// DepositsSince читает транзакции кошелька account с lt > afterLT по
// возрастанию и отбирает входящие переводы TON.
//
// Депозитом считается транзакция, у которой входящее сообщение внутреннее
// (есть отправитель), не bounced, с ненулевой суммой, и транзакция не
// прервана. Внешние сообщения (наши собственные выводы) и возвраты
// пропускаются.
func (t *Toncenter) DepositsSince(ctx context.Context, account string, afterLT uint64, limit int) (DepositBatch, error) {
	txs, err := t.transactions(ctx, account, afterLT+1, "asc", limit)
	if err != nil {
		return DepositBatch{}, err
	}
	return parseDeposits(txs, afterLT, limit)
}

func parseDeposits(txs []toncenterTx, afterLT uint64, limit int) (DepositBatch, error) {
	batch := DepositBatch{NextLT: afterLT, Full: len(txs) >= limit}
	for _, tx := range txs {
		lt, err := strconv.ParseUint(tx.LT, 10, 64)
		if err != nil {
			return DepositBatch{}, fmt.Errorf("transaction %s: bad lt %q", tx.Hash, tx.LT)
		}
		if lt <= afterLT {
			continue // на всякий случай: start_lt включительный
		}
		if lt > batch.NextLT {
			batch.NextLT = lt
		}
		if d, ok := toDeposit(tx, lt); ok {
			batch.Deposits = append(batch.Deposits, d)
		}
	}
	return batch, nil
}

func toDeposit(tx toncenterTx, lt uint64) (Deposit, bool) {
	in := tx.InMsg
	if in == nil || in.Source == nil || *in.Source == "" || in.Bounced || in.Value == nil {
		return Deposit{}, false
	}
	if !txResult(tx).Success {
		return Deposit{}, false
	}
	amount, err := strconv.ParseUint(*in.Value, 10, 64)
	if err != nil || amount == 0 {
		return Deposit{}, false
	}
	d := Deposit{
		TxHash:      tx.Hash,
		LT:          lt,
		FromAddress: *in.Source,
		ToAddress:   in.Destination,
		AmountNano:  amount,
		Utime:       tx.Now,
	}
	if mc := in.MessageContent; mc != nil && mc.Decoded != nil && mc.Decoded.Type == "text_comment" {
		d.Comment = strings.TrimSpace(mc.Decoded.Comment)
	}
	return d, true
}

// FormatNano переводит nanoton в десятичную строку без лишних нулей:
// 50000000000 → "50", 1500000000 → "1.5".
func FormatNano(v uint64) string {
	s := strconv.FormatUint(v, 10)
	if len(s) <= 9 {
		s = strings.Repeat("0", 10-len(s)) + s
	}
	intPart, frac := s[:len(s)-9], strings.TrimRight(s[len(s)-9:], "0")
	if frac == "" {
		return intPart
	}
	return intPart + "." + frac
}
