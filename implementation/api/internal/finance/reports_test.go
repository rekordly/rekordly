package finance

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
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

func TestSearchParam(t *testing.T) {
	if searchParam("   ").Valid {
		t.Fatal("blank search must not filter")
	}
	if got := searchParam(" 50%_off ").String; got != `50\%\_off` {
		t.Fatalf("wildcards must be escaped, got %q", got)
	}
	long := make([]rune, 500)
	for i := range long {
		long[i] = 'a'
	}
	if got := len(searchParam(string(long)).String); got != maxSearchLength {
		t.Fatalf("search must be bounded, got %d", got)
	}
}

func TestPreviousWindow(t *testing.T) {
	day := func(s string) time.Time { v, _ := time.Parse("2006-01-02", s); return v }
	cases := []struct{ from, to, wantFrom, wantTo string }{
		{"2026-11-01", "2026-11-13", "2026-10-01", "2026-10-13"}, // this month so far vs same days last month
		{"2026-09-01", "2026-11-13", "2026-06-01", "2026-08-13"}, // three months
		{"2026-03-01", "2026-03-31", "2026-02-01", "2026-02-28"}, // clamps to a shorter month
		{"2026-11-10", "2026-11-16", "2026-11-03", "2026-11-09"}, // a week vs the week before
	}
	for _, c := range cases {
		gotFrom, gotTo := previousWindow(day(c.from), day(c.to))
		if gotFrom.Format("2006-01-02") != c.wantFrom || gotTo.Format("2006-01-02") != c.wantTo {
			t.Errorf("previousWindow(%s, %s) = %s..%s, want %s..%s", c.from, c.to, gotFrom.Format("2006-01-02"), gotTo.Format("2006-01-02"), c.wantFrom, c.wantTo)
		}
	}
}

func TestFillDays(t *testing.T) {
	start := time.Date(2026, time.November, 7, 0, 0, 0, 0, time.UTC)
	rows := []db.GetDailyIncomeExpenseRow{{Day: pgtype.Date{Time: start.AddDate(0, 0, 2), Valid: true}, IncomeMinor: 500, ExpenseMinor: 200}}
	got := fillDays(start, rows)
	if len(got) != 7 || got[0].Date != "2026-11-07" || got[6].Date != "2026-11-13" {
		t.Fatalf("expected seven consecutive days, got %+v", got)
	}
	if got[2].IncomeMinor != 500 || got[2].ExpenseMinor != 200 || got[3].IncomeMinor != 0 {
		t.Fatalf("days not filled correctly: %+v", got)
	}
}
