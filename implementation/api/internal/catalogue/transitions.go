package catalogue

import "fmt"

// InvalidTransitionError is returned whenever a state transition is disallowed.
// It always exposes current state, current version, and a safe recovery action.
type InvalidTransitionError struct {
	Code               string `json:"code"`
	Machine            string `json:"machine"`
	CurrentState       string `json:"current_state"`
	TargetState        string `json:"target_state"`
	CurrentVersion     string `json:"current_version"`
	SafeRecoveryAction string `json:"safe_recovery_action"`
}

func (e *InvalidTransitionError) Error() string {
	return fmt.Sprintf("%s: cannot transition %s from %q to %q (version %s)", e.Code, e.Machine, e.CurrentState, e.TargetState, e.CurrentVersion)
}

type TransitionTable map[string][]string

var stateMachines = map[string]TransitionTable{
	"identity.account": {
		"pending_verification": {"active", "expired", "blocked"},
		"active":               {"security_restricted", "deletion_requested", "disabled"},
		"security_restricted":  {"active", "disabled", "deletion_requested"},
		"deletion_requested":   {"active", "purge_review"},
		"purge_review":         {"retention_hold", "purging"},
		"retention_hold":       {"purge_review"},
		"purging":              {"deleted", "purge_failed"},
		"purge_failed":         {"purging"},
		"deleted":              {}, // terminal
		"disabled":             {"active"},
	},
	"auth.session": {
		"active":     {"rotated", "expired", "revoked", "suspicious"},
		"suspicious": {"active", "revoked"},
		"rotated":    {}, // terminal
		"expired":    {}, // terminal
		"revoked":    {}, // terminal
	},
	"workspace": {
		"setup":            {"active", "archived", "deletion_pending"},
		"active":           {"read_only", "archived", "deletion_pending"},
		"read_only":        {"active", "archived", "deletion_pending"},
		"archived":         {"active", "deletion_pending"},
		"deletion_pending": {"active", "purging"},
		"purging":          {"deleted"},
		"deleted":          {}, // terminal
	},
	"membership": {
		"pending_invitation": {"active", "expired", "revoked"},
		"active":             {"suspended", "billing_restricted", "removed"},
		"suspended":          {"active", "removed"},
		"billing_restricted": {"active", "removed"},
		"removed":            {}, // terminal
		"expired":            {}, // terminal
		"revoked":            {}, // terminal
	},
	"money.draft": {
		"draft":        {"confirmed", "discarded", "needs_review"},
		"needs_review": {"draft", "confirmed", "discarded"},
		"confirmed":    {}, // terminal
		"discarded":    {}, // terminal
	},
	"money.entry": {
		"posted":   {"reversed"},
		"reversed": {}, // terminal
	},
	"sales.invoice": {
		"draft":          {"issued", "cancelled"},
		"issued":         {"partially_paid", "paid", "voided", "reversed"},
		"partially_paid": {"paid", "reversed"},
		"paid":           {"reversed"},
		"cancelled":      {}, // terminal
		"voided":         {}, // terminal
		"reversed":       {}, // terminal
	},
	"purchasing.po": {
		"draft":              {"pending_approval", "issued", "cancelled"},
		"pending_approval":   {"issued", "rejected", "draft"},
		"issued":             {"partially_received", "received", "closed", "cancelled"},
		"partially_received": {"received", "closed"},
		"received":           {"closed"},
		"rejected":           {"draft"},
		"closed":             {}, // terminal
		"cancelled":          {}, // terminal
	},
	"inventory.transfer": {
		"draft":      {"dispatched", "cancelled"},
		"dispatched": {"received", "disputed"},
		"disputed":   {"received"},
		"received":   {}, // terminal
		"cancelled":  {}, // terminal
	},
	"billing.subscription": {
		"trialing":  {"active", "past_due", "cancelled", "expired"},
		"active":    {"past_due", "cancelled", "expired"},
		"past_due":  {"active", "cancelled", "expired"},
		"cancelled": {"active"},
		"expired":   {"active"},
	},
	"privacy.deletion": {
		"requested":        {"grace_restricted", "restoring"},
		"grace_restricted": {"restoring", "purge_review"},
		"restoring":        {"restored"},
		"restored":         {}, // terminal
		"purge_review":     {"retention_hold", "purging"},
		"retention_hold":   {"purge_review"},
		"purging":          {"deleted", "purge_failed"},
		"purge_failed":     {"purging"},
		"deleted":          {}, // terminal
	},
	"support.case": {
		"new":                {"triaged", "security_incident"},
		"triaged":            {"waiting_on_support", "waiting_on_user", "security_incident", "resolved"},
		"waiting_on_support": {"waiting_on_user", "resolved", "security_incident"},
		"waiting_on_user":    {"waiting_on_support", "resolved"},
		"security_incident":  {"resolved"},
		"resolved":           {"closed", "reopened"},
		"reopened":           {"waiting_on_support", "resolved"},
		"closed":             {"reopened"},
	},
	"operations.job": {
		"queued":          {"processing", "cancelled"},
		"processing":      {"succeeded", "retry_scheduled", "dead_letter"},
		"retry_scheduled": {"processing", "cancelled", "dead_letter"},
		"dead_letter":     {"queued", "cancelled"},
		"succeeded":       {}, // terminal
		"cancelled":       {}, // terminal
	},
	"review.item": {
		"open":        {"in_progress", "blocked", "resolved", "dismissed", "superseded"},
		"in_progress": {"blocked", "resolved", "dismissed", "superseded"},
		"blocked":     {"open", "in_progress", "resolved", "superseded"},
		"resolved":    {}, // terminal
		"dismissed":   {}, // terminal
		"superseded":  {}, // terminal
	},
}

func ValidateTransition(machine, fromState, toState, currentVersion string) error {
	table, ok := stateMachines[machine]
	if !ok {
		return &InvalidTransitionError{
			Code:               "UNKNOWN_STATE_MACHINE",
			Machine:            machine,
			CurrentState:       fromState,
			TargetState:        toState,
			CurrentVersion:     currentVersion,
			SafeRecoveryAction: "contact_support",
		}
	}
	allowed, exists := table[fromState]
	if !exists {
		return &InvalidTransitionError{
			Code:               "INVALID_CURRENT_STATE",
			Machine:            machine,
			CurrentState:       fromState,
			TargetState:        toState,
			CurrentVersion:     currentVersion,
			SafeRecoveryAction: "reload_record",
		}
	}
	for _, candidate := range allowed {
		if candidate == toState {
			return nil
		}
	}
	recovery := "reload_record"
	if len(allowed) == 0 {
		recovery = "create_reversal_or_new_record"
	}
	return &InvalidTransitionError{
		Code:               "INVALID_STATE_TRANSITION",
		Machine:            machine,
		CurrentState:       fromState,
		TargetState:        toState,
		CurrentVersion:     currentVersion,
		SafeRecoveryAction: recovery,
	}
}

func AllStateMachines() map[string]TransitionTable {
	return stateMachines
}
