package finance_test

import (
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestParseMajorToMinor(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		exponent  int
		expected  int64
		expectErr bool
	}{
		{name: "standard 2 decimals", input: "10.05", exponent: 2, expected: 1005},
		{name: "standard single decimal padded", input: "10.5", exponent: 2, expected: 1050},
		{name: "whole integer string", input: "10", exponent: 2, expected: 1000},
		{name: "small decimal", input: "0.05", exponent: 2, expected: 5},
		{name: "leading zeros", input: "00010.05", exponent: 2, expected: 1005},
		{name: "zero exponent integer", input: "500", exponent: 0, expected: 500},
		{name: "three exponent", input: "1.250", exponent: 3, expected: 1250},
		{name: "three exponent padded", input: "1.2", exponent: 3, expected: 1200},
		{name: "excess fractional digits rejected", input: "10.050", exponent: 2, expectErr: true},
		{name: "negative rejected", input: "-10.05", exponent: 2, expectErr: true},
		{name: "plus sign rejected", input: "+10.05", exponent: 2, expectErr: true},
		{name: "scientific notation rejected", input: "1e3", exponent: 2, expectErr: true},
		{name: "commas rejected", input: "1,000.00", exponent: 2, expectErr: true},
		{name: "zero rejected", input: "0.00", exponent: 2, expectErr: true},
		{name: "empty rejected", input: "", exponent: 2, expectErr: true},
		{name: "alphabetic rejected", input: "abc", exponent: 2, expectErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res, err := finance.ParseMajorToMinor(tc.input, tc.exponent)
			if tc.expectErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				require.Equal(t, tc.expected, res)
			}
		})
	}
}

func TestFormatMinorToMajor(t *testing.T) {
	require.Equal(t, "10.05", finance.FormatMinorToMajor(1005, 2))
	require.Equal(t, "0.05", finance.FormatMinorToMajor(5, 2))
	require.Equal(t, "10.00", finance.FormatMinorToMajor(1000, 2))
	require.Equal(t, "500", finance.FormatMinorToMajor(500, 0))
	require.Equal(t, "1.250", finance.FormatMinorToMajor(1250, 3))
	require.Equal(t, "-10.05", finance.FormatMinorToMajor(-1005, 2))
}
