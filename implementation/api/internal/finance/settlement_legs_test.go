package finance

import (
	"errors"
	"testing"
)

func TestSettlementLegs(t *testing.T) {
	// One leg with no amount means paid in full.
	paid, legs, err := settlementLegs([]PaymentLegInput{{MoneyAccountID: 7}}, 10_000, 2)
	if err != nil || paid != 10_000 || legs[0].AmountMinor != 10_000 {
		t.Fatalf("full payment: paid=%d legs=%+v err=%v", paid, legs, err)
	}

	// Part payment in major units.
	paid, legs, err = settlementLegs([]PaymentLegInput{{MoneyAccountID: 7, AmountMajor: "40.50"}}, 10_000, 2)
	if err != nil || paid != 4_050 || legs[0].AmountMinor != 4_050 {
		t.Fatalf("part payment: paid=%d legs=%+v err=%v", paid, legs, err)
	}

	// Split across two accounts.
	paid, _, err = settlementLegs([]PaymentLegInput{{MoneyAccountID: 1, AmountMinor: 3_000}, {MoneyAccountID: 2, AmountMinor: 2_000}}, 10_000, 2)
	if err != nil || paid != 5_000 {
		t.Fatalf("split payment: paid=%d err=%v", paid, err)
	}

	// Never more than the total.
	if _, _, err = settlementLegs([]PaymentLegInput{{MoneyAccountID: 1, AmountMinor: 12_000}}, 10_000, 2); !errors.Is(err, ErrPaidExceedsTotal) {
		t.Fatalf("overpayment should fail, got %v", err)
	}

	// With several legs, each needs an amount.
	if _, _, err = settlementLegs([]PaymentLegInput{{MoneyAccountID: 1}, {MoneyAccountID: 2, AmountMinor: 100}}, 10_000, 2); !errors.Is(err, ErrNegativeAmount) {
		t.Fatalf("missing leg amount should fail, got %v", err)
	}
}
