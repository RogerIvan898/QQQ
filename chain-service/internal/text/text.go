// Package text — работа со строками для логов и заголовков.
package text

import "strings"

// Truncate обрезает s до max байт, не оставляя разрезанного UTF-8 символа.
func Truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return strings.ToValidUTF8(s[:max], "")
}
