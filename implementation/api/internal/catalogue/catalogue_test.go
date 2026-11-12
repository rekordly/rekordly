package catalogue

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBlueprint18_RegistriesAndValidators(t *testing.T) {
	eventSet := make(map[string]EventSpec, len(Events))
	for _, e := range Events {
		eventSet[e.Type] = e
	}

	// 1. Every registered command emits a registered event and validates cleanly.
	for _, cmd := range Commands {
		if _, err := ValidateCommand(cmd.Type, cmd.Version); err != nil {
			t.Fatalf("command %s failed validation: %v", cmd.Type, err)
		}
		ev, ok := eventSet[cmd.EmitsEvent]
		if !ok {
			t.Fatalf("command %s emits unregistered event %q", cmd.Type, cmd.EmitsEvent)
		}
		if cmd.OwnsAccountingEffect && ev.AccountingOwner == "" {
			t.Fatalf("command %s owns accounting effect but event %s lacks accounting_owner", cmd.Type, ev.Type)
		}
		if cmd.OwnsStockEffect && ev.StockOwner == "" {
			t.Fatalf("command %s owns stock effect but event %s lacks stock_owner", cmd.Type, ev.Type)
		}
	}

	// 2. Unknown command/event/job versions fail safely.
	if _, err := ValidateCommand("sales.invoice.issue", 99); err == nil {
		t.Fatal("expected unsupported command version error")
	}
	if _, err := ValidateEvent("sales.invoice.issued", 99); err == nil {
		t.Fatal("expected unsupported event version error")
	}
	if _, err := ValidateJob("documents.pdf.render", 99); err == nil {
		t.Fatal("expected unsupported job version error")
	}

	// 3. State transition validators block terminal resurrection and expose current state/version.
	if err := ValidateTransition("sales.invoice", "draft", "issued", "1"); err != nil {
		t.Fatalf("expected draft -> issued to succeed: %v", err)
	}
	err := ValidateTransition("sales.invoice", "voided", "issued", "4")
	if err == nil {
		t.Fatal("expected terminal voided -> issued to fail")
	}
	transErr, ok := err.(*InvalidTransitionError)
	if !ok {
		t.Fatalf("expected InvalidTransitionError, got %T", err)
	}
	if transErr.CurrentState != "voided" || transErr.CurrentVersion != "4" {
		t.Fatalf("unexpected transition error metadata: %+v", transErr)
	}

	// 4. Analytics rejects forbidden financial/contact properties.
	if err := ValidateAnalyticsProperties(map[string]any{"workspace_kind": "business", "count": 1}); err != nil {
		t.Fatalf("expected safe analytics properties to pass: %v", err)
	}
	for _, badKey := range []string{"amount", "narration", "email", "otp", "token"} {
		if err := ValidateAnalyticsProperties(map[string]any{badKey: "x"}); err == nil {
			t.Fatalf("expected forbidden analytics key %q to fail", badKey)
		}
	}

	// 5. Export shared Go/TypeScript contract fixture.
	contract := map[string]any{
		"schema_version":         1,
		"commands":               Commands,
		"events":                 Events,
		"jobs":                   Jobs,
		"review_item_types":      ReviewItemTypes,
		"notification_templates": NotificationTemplates,
		"error_codes":            ErrorCodes,
		"state_machines":         AllStateMachines(),
	}
	raw, err := json.MarshalIndent(contract, "", "  ")
	if err != nil {
		t.Fatalf("marshal contract: %v", err)
	}
	outPath := filepath.Join("..", "..", "..", "shared", "catalogue-contract.json")
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		t.Fatalf("mkdir shared: %v", err)
	}
	if err := os.WriteFile(outPath, append(raw, '\n'), 0o644); err != nil {
		t.Fatalf("write contract fixture: %v", err)
	}
}
