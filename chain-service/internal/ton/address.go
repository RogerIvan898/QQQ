package ton

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// ParseAddress разбирает адрес в user-friendly (EQ…, UQ…, kQ…) или raw
// (0:abcd…) виде.
func ParseAddress(s string) (*address.Address, error) {
	s = strings.TrimSpace(s)
	if strings.Contains(s, ":") {
		return address.ParseRawAddr(s)
	}
	return address.ParseAddr(s)
}

// ExternalDestination возвращает адресата внешнего входящего сообщения из
// BOC (base64), то есть кошелёк, который его исполнит.
func ExternalDestination(boc string) (*address.Address, error) {
	raw, err := base64.StdEncoding.DecodeString(boc)
	if err != nil {
		return nil, fmt.Errorf("boc is not valid base64: %w", err)
	}
	root, err := cell.FromBOC(raw)
	if err != nil {
		return nil, fmt.Errorf("boc is not a valid bag of cells: %w", err)
	}
	slice, err := root.BeginParse()
	if err != nil {
		return nil, fmt.Errorf("boc root: %w", err)
	}
	var msg tlb.Message
	if err := msg.LoadFromCell(slice); err != nil {
		return nil, fmt.Errorf("boc is not a message: %w", err)
	}
	ext, ok := msg.Msg.(*tlb.ExternalMessage)
	if !ok || msg.MsgType != tlb.MsgTypeExternalIn {
		return nil, fmt.Errorf("boc is %s message, want external in", msg.MsgType)
	}
	if ext.DstAddr == nil {
		return nil, errors.New("external message has no destination")
	}
	return ext.DstAddr, nil
}
