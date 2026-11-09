package finance

import (
	"testing"
	"time"
)

func TestResolveSummaryWindow(t *testing.T) {
	now := time.Date(2026, time.November, 9, 0, 0, 0, 0, time.UTC)

	from, to, err := resolveSummaryWindow("", "", now)
	if err != nil {
		t.Fatalf("default window: %v", err)
	}
	if from.Format("2006-01-02") != "2026-06-01" || !to.Equal(now) {
		t.Fatalf("default window = %s to %s", from, to)
	}

	if _, _, err := resolveSummaryWindow("2026-02-01", "2026-01-01", now); err == nil {
		t.Fatal("expected reversed range to fail")
	}
	if _, _, err := resolveSummaryWindow("2020-01-01", "2026-01-01", now); err == nil {
		t.Fatal("expected an over-long range to fail")
	}
	if _, _, err := resolveSummaryWindow("not-a-date", "", now); err == nil {
		t.Fatal("expected an invalid date to fail")
	}
}
