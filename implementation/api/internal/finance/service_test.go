package finance

import "testing"

func TestMinorUnits(t *testing.T) {
	tests := []struct { name, amount string; exponent int; want int64; valid bool }{
		{name: "naira", amount: "1,000", exponent: 2, valid: false},
		{name: "naira decimal", amount: "1000.50", exponent: 2, want: 100050, valid: true},
		{name: "whole", amount: "7", exponent: 2, want: 700, valid: true},
		{name: "zero", amount: "0.00", exponent: 2, valid: false},
		{name: "too precise", amount: "1.001", exponent: 2, valid: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := minorUnits(test.amount, test.exponent)
			if test.valid && (err != nil || got != test.want) { t.Fatalf("minorUnits() = %d, %v; want %d", got, err, test.want) }
			if !test.valid && err == nil { t.Fatal("minorUnits() accepted invalid amount") }
		})
	}
}
