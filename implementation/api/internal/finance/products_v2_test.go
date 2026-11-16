package finance

import (
	"strings"
	"testing"
)

func TestSkuPrefix(t *testing.T) {
	cases := map[string]string{
		"Logo design pack": "LOGDES",
		"Rice":             "RIC",
		"5kg bag of rice":  "5KGBAG",
		"!!!":              "ITEM",
	}
	for name, want := range cases {
		if got := skuPrefix(name); got != want {
			t.Errorf("skuPrefix(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestMinorToMajorString(t *testing.T) {
	cases := []struct {
		minor    int64
		exponent int
		want     string
	}{
		{250050, 2, "2500.50"},
		{5, 2, "0.05"},
		{1200, 0, "1200"},
		{1234567, 3, "1234.567"},
	}
	for _, c := range cases {
		if got := minorToMajorString(c.minor, c.exponent); got != c.want {
			t.Errorf("minorToMajorString(%d, %d) = %q, want %q", c.minor, c.exponent, got, c.want)
		}
	}
}

func TestValidateProduct(t *testing.T) {
	base := SaveProductInput{Name: "Rice 5kg", Kind: "stock_tracked", SellingPrice: "12000", CostPrice: "9000", Currency: "NGN"}
	v, err := validateProduct(base, "NGN")
	if err != nil {
		t.Fatalf("valid product rejected: %v", err)
	}
	if v.price != 1_200_000 || v.cost != 900_000 || v.status != "active" || v.unit != "each" {
		t.Fatalf("unexpected values: %+v", v)
	}

	bad := base
	bad.Kind = "gadget"
	if _, err := validateProduct(bad, "NGN"); err == nil {
		t.Error("an unknown type should be rejected")
	}

	lowCompare := base
	lowCompare.CompareAtPrice = "10000"
	if _, err := validateProduct(lowCompare, "NGN"); err == nil {
		t.Error("a compare-at price below the selling price should be rejected")
	}

	insecure := base
	insecure.ImageURLs = []string{"http://example.com/a.png"}
	if _, err := validateProduct(insecure, "NGN"); err == nil {
		t.Error("non-https images should be rejected")
	}

	noName := base
	noName.Name = "   "
	if _, err := validateProduct(noName, "NGN"); err == nil {
		t.Error("a blank name should be rejected")
	}
}

func TestDescribeProductChanges(t *testing.T) {
	current := ProductSummary{Name: "Rice", Kind: "non_stock", Status: "active", UnitName: "bag", CostPriceMinor: 100, ImageURLs: []string{}}
	next, _ := validateProduct(SaveProductInput{Name: "Rice 5kg", Kind: "non_stock", UnitName: "bag", SellingPrice: "1", CostPrice: "2", Currency: "NGN"}, "NGN")
	got := describeProductChanges(current, next)
	if !strings.Contains(got, "name") || !strings.Contains(got, "cost price") || strings.Contains(got, "unit") {
		t.Fatalf("describeProductChanges = %q", got)
	}
	same, _ := validateProduct(SaveProductInput{Name: "Rice", Kind: "non_stock", UnitName: "bag", SellingPrice: "1", CostPrice: "1", Currency: "NGN"}, "NGN")
	if describeProductChanges(current, same) != "" {
		t.Fatal("no change should produce no summary")
	}
}

func TestMoneyLabel(t *testing.T) {
	cases := []struct {
		minor    int64
		exponent int
		want     string
	}{
		{1500000, 2, "NGN 15,000.00"},
		{99, 2, "NGN 0.99"},
		{123456789, 2, "NGN 1,234,567.89"},
		{5000, 0, "NGN 5,000"},
	}
	for _, c := range cases {
		if got := moneyLabel("NGN", c.minor, c.exponent); got != c.want {
			t.Errorf("moneyLabel(%d, %d) = %q, want %q", c.minor, c.exponent, got, c.want)
		}
	}
}

func TestSanitizeRichText(t *testing.T) {
	cases := []struct{ in, want string }{
		{`<p>Hello <strong>there</strong></p>`, `<p>Hello <strong>there</strong></p>`},
		{`<p onclick="x()">Hi</p><script>alert(1)</script>`, `<p>Hi</p>`},
		{`<a href="javascript:alert(1)">bad</a>`, `<a>bad</a>`},
		{`<a href="https://example.com" style="x">ok</a>`, `<a href="https://example.com" rel="noopener noreferrer nofollow" target="_blank">ok</a>`},
		{`<h1>Big</h1><img src=x onerror=alert(1)><ul><li><p>One</p></li></ul>`, `Big<ul><li><p>One</p></li></ul>`},
		{`<p><em>unclosed`, `<p><em>unclosed</em></p>`},
		{`<p>a &lt; b</p><hr><br/>`, `<p>a &lt; b</p><hr><br>`},
		{`<style>p{}</style><p></p>`, ``},
		{`<p></p><p>Hi</p><p></p><p>Yo</p><p></p>`, `<p>Hi</p><p></p><p>Yo</p>`},
		{`<p>Hi</p><p></p><p></p>`, `<p>Hi</p>`},
		{`<svg><script>alert(1)</script></svg><p>x</p>`, `<p>x</p>`},
	}
	for _, c := range cases {
		if got := SanitizeRichText(c.in); got != c.want {
			t.Errorf("SanitizeRichText(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestApplyPriceRule(t *testing.T) {
	// 15,000 +10% gives 16,500 (with exponent 0)
	got, err := applyPriceRule(15000, BulkPriceRuleInput{Direction: "increase", By: "percent", Value: "10"}, 0)
	if err != nil || got != 16500 {
		t.Fatalf("15,000 +10%% = %d, err: %v; want 16500", got, err)
	}

	// 15,000.00 +10% gives 16,500.00 (with exponent 2)
	got, err = applyPriceRule(1500000, BulkPriceRuleInput{Direction: "increase", By: "percent", Value: "10"}, 2)
	if err != nil || got != 1650000 {
		t.Fatalf("15,000.00 +10%% = %d, err: %v; want 1650000", got, err)
	}

	// 16,537 rounded to 50 gives 16,550 (with exponent 0)
	got, err = applyPriceRule(16537, BulkPriceRuleInput{Direction: "increase", By: "amount", Value: "0", Round: "50"}, 0)
	if err != nil || got != 16550 {
		t.Fatalf("16,537 rounded to 50 = %d, err: %v; want 16550", got, err)
	}

	// percentage over 100 is rejected
	_, err = applyPriceRule(1000, BulkPriceRuleInput{Direction: "increase", By: "percent", Value: "101"}, 2)
	if err == nil {
		t.Fatal("percentage over 100 should be rejected")
	}

	// a decrease clamps at 0
	got, err = applyPriceRule(500, BulkPriceRuleInput{Direction: "decrease", By: "amount", Value: "10"}, 2)
	if err != nil || got != 0 {
		t.Fatalf("decrease clamp at 0: got %d, err: %v; want 0", got, err)
	}

	// percentage decrease clamp at 0
	got, err = applyPriceRule(500, BulkPriceRuleInput{Direction: "decrease", By: "percent", Value: "100"}, 2)
	if err != nil || got != 0 {
		t.Fatalf("100%% decrease: got %d, err: %v; want 0", got, err)
	}
}
