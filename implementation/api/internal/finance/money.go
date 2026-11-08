package finance

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

var (
	ErrInvalidAmount   = errors.New("invalid monetary amount")
	ErrAmountOverflow  = errors.New("monetary amount overflow")
	ErrNegativeAmount  = errors.New("monetary amount must be positive")
	ErrInvalidCurrency = errors.New("invalid currency code")
)

// CurrencyExponent returns the standard minor-unit exponent for ISO 4217 currency codes.
func CurrencyExponent(currency string) int {
	switch strings.ToUpper(strings.TrimSpace(currency)) {
	case "JPY", "KRW", "VND", "CLP", "UGX", "RWF", "BIF", "GNF", "PYG":
		return 0
	case "BHD", "JOD", "KWD", "OMR", "TND", "IQD", "LYD":
		return 3
	default:
		// NGN, USD, EUR, GBP, CAD, AUD, etc.
		return 2
	}
}

// ParseMajorToMinor parses a decimal string into signed integer minor units without float arithmetic.
// Accepts plain decimal notation, e.g. "100.50", "10", "0.05".
func ParseMajorToMinor(input string, exponent int) (int64, error) {
	s := strings.TrimSpace(input)
	if s == "" {
		return 0, ErrInvalidAmount
	}
	if exponent < 0 || exponent > 4 {
		return 0, fmt.Errorf("%w: unsupported exponent %d", ErrInvalidAmount, exponent)
	}

	// Reject signs, commas, scientific notation
	if strings.HasPrefix(s, "+") || strings.HasPrefix(s, "-") {
		return 0, ErrInvalidAmount
	}
	if strings.ContainsAny(s, ",eE \t\r\n") {
		return 0, ErrInvalidAmount
	}

	parts := strings.Split(s, ".")
	if len(parts) > 2 {
		return 0, ErrInvalidAmount
	}

	wholeStr := parts[0]
	fractionStr := ""
	if len(parts) == 2 {
		fractionStr = parts[1]
	}

	if wholeStr == "" && fractionStr == "" {
		return 0, ErrInvalidAmount
	}
	if wholeStr == "" {
		wholeStr = "0"
	}

	// Validate characters are ASCII digits
	for _, ch := range wholeStr {
		if ch < '0' || ch > '9' {
			return 0, ErrInvalidAmount
		}
	}
	for _, ch := range fractionStr {
		if ch < '0' || ch > '9' {
			return 0, ErrInvalidAmount
		}
	}

	if len(fractionStr) > exponent {
		return 0, fmt.Errorf("%w: excess fraction digits for exponent %d", ErrInvalidAmount, exponent)
	}

	// Pad fraction with trailing zeros up to exponent
	paddedFraction := fractionStr + strings.Repeat("0", exponent-len(fractionStr))

	// Trim leading zeros from whole
	trimmedWhole := strings.TrimLeft(wholeStr, "0")
	if trimmedWhole == "" {
		trimmedWhole = "0"
	}

	combinedDigits := trimmedWhole + paddedFraction
	if trimmedWhole == "0" && strings.TrimLeft(paddedFraction, "0") == "" {
		return 0, ErrNegativeAmount
	}

	// Parse to int64
	minor, err := strconv.ParseInt(combinedDigits, 10, 64)
	if err != nil {
		if errors.Is(err, strconv.ErrRange) {
			return 0, ErrAmountOverflow
		}
		return 0, ErrInvalidAmount
	}

	if minor <= 0 {
		return 0, ErrNegativeAmount
	}

	// Cap at maximum safe commercial amount (₦100 billion minor units)
	const maxMinorUnit = 10_000_000_000_000_000
	if minor > maxMinorUnit {
		return 0, ErrAmountOverflow
	}

	return minor, nil
}

// FormatMinorToMajor converts integer minor units to a major-unit string, e.g. 1005 with exponent 2 -> "10.05".
func FormatMinorToMajor(minor int64, exponent int) string {
	if exponent <= 0 {
		return strconv.FormatInt(minor, 10)
	}
	sign := ""
	if minor < 0 {
		sign = "-"
		minor = -minor
	}
	s := strconv.FormatInt(minor, 10)
	if len(s) <= exponent {
		padded := strings.Repeat("0", exponent-len(s)+1) + s
		s = padded
	}
	splitIndex := len(s) - exponent
	return sign + s[:splitIndex] + "." + s[splitIndex:]
}

// CheckedAdd adds two int64 values and returns an error on overflow.
func CheckedAdd(a, b int64) (int64, error) {
	if (b > 0 && a > math.MaxInt64-b) || (b < 0 && a < math.MinInt64-b) {
		return 0, ErrAmountOverflow
	}
	return a + b, nil
}

// CheckedSub subtracts two int64 values and returns an error on overflow.
func CheckedSub(a, b int64) (int64, error) {
	if (b < 0 && a > math.MaxInt64+b) || (b > 0 && a < math.MinInt64+b) {
		return 0, ErrAmountOverflow
	}
	return a - b, nil
}
