package handler

import (
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// tonDecimals — число знаков после запятой у TON (1 TON = 10^9 nanoton).
const tonDecimals = 9

// ParseAmount переводит десятичную строку ("50.0", "0.000000001") в
// наименьшие единицы (nanoton). Числа с плавающей точкой не используются:
// для денег это недопустимо. Отклоняются отрицательные, нулевые, слишком
// точные (больше 9 знаков) и переполняющие uint64 суммы, экспонента и
// разделители групп.
func ParseAmount(s string, decimals int) (uint64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, errors.New("amount is empty")
	}
	intPart, fracPart, hasDot := strings.Cut(s, ".")
	if intPart == "" || (hasDot && fracPart == "") {
		return 0, fmt.Errorf("amount %q: malformed decimal", s)
	}
	if !isDigits(intPart) || (hasDot && !isDigits(fracPart)) {
		return 0, fmt.Errorf("amount %q: only digits and one dot are allowed", s)
	}
	if len(fracPart) > decimals {
		return 0, fmt.Errorf("amount %q: more than %d fractional digits", s, decimals)
	}

	digits := strings.TrimLeft(intPart+fracPart+strings.Repeat("0", decimals-len(fracPart)), "0")
	if digits == "" {
		return 0, fmt.Errorf("amount %q: must be positive", s)
	}
	v, err := strconv.ParseUint(digits, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("amount %q: out of range", s)
	}
	return v, nil
}

func isDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return len(s) > 0
}

// ValidateTONAddress проверяет адрес TON в одном из форматов:
//   - raw: "<workchain>:<64 hex>", например "0:83df...";
//   - user-friendly: 48 символов base64/base64url, 36 байт:
//     [флаги][workchain][32 байта hash][CRC16-XMODEM 2 байта].
//
// Проверяются флаги (bounceable/non-bounceable, testnet), workchain
// (0 — basechain, -1 — masterchain) и контрольная сумма.
func ValidateTONAddress(addr string) error {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return errors.New("address is empty")
	}

	if wc, hash, ok := strings.Cut(addr, ":"); ok {
		if wc != "0" && wc != "-1" {
			return fmt.Errorf("address %q: unsupported workchain %s", addr, wc)
		}
		if len(hash) != 64 {
			return fmt.Errorf("address %q: raw hash must be 64 hex chars", addr)
		}
		if _, err := hex.DecodeString(hash); err != nil {
			return fmt.Errorf("address %q: raw hash is not hex", addr)
		}
		return nil
	}

	if len(addr) != 48 {
		return fmt.Errorf("address %q: user-friendly form must be 48 chars", addr)
	}
	var raw []byte
	var err error
	if strings.ContainsAny(addr, "-_") {
		raw, err = base64.URLEncoding.DecodeString(addr)
	} else {
		raw, err = base64.StdEncoding.DecodeString(addr)
	}
	if err != nil || len(raw) != 36 {
		return fmt.Errorf("address %q: invalid base64", addr)
	}

	flags := raw[0] &^ 0x80 // 0x80 — флаг testnet
	if flags != 0x11 && flags != 0x51 {
		return fmt.Errorf("address %q: unknown address flags 0x%02x", addr, raw[0])
	}
	if raw[1] != 0x00 && raw[1] != 0xff {
		return fmt.Errorf("address %q: unsupported workchain", addr)
	}
	want := uint16(raw[34])<<8 | uint16(raw[35])
	if crc16XMODEM(raw[:34]) != want {
		return fmt.Errorf("address %q: checksum mismatch", addr)
	}
	return nil
}

// crc16XMODEM — CRC-16/XMODEM (poly 0x1021, init 0), как в TON.
func crc16XMODEM(data []byte) uint16 {
	var crc uint16
	for _, b := range data {
		crc ^= uint16(b) << 8
		for i := 0; i < 8; i++ {
			if crc&0x8000 != 0 {
				crc = crc<<1 ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return crc
}
