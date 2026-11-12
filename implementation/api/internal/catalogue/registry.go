package catalogue

import (
	"fmt"
	"strings"
)

type EventClass string

const (
	ClassDomainEvent      EventClass = "domain"
	ClassIntegrationEvent EventClass = "integration"
	ClassProviderEvent    EventClass = "provider"
	ClassAuditEvent       EventClass = "audit"
	ClassSecurityEvent    EventClass = "security"
	ClassAnalyticsEvent   EventClass = "analytics"
	ClassReviewSignal     EventClass = "review_signal"
)

type CommandSpec struct {
	Type                    string `json:"type"`
	Version                 int    `json:"version"`
	Module                  string `json:"module"`
	Permission              string `json:"permission,omitempty"`
	Entitlement             string `json:"entitlement,omitempty"`
	IdempotencyRequired     bool   `json:"idempotency_required"`
	ExpectedVersionRequired bool   `json:"expected_version_required"`
	EmitsEvent              string `json:"emits_event"`
	OwnsAccountingEffect    bool   `json:"owns_accounting_effect"`
	OwnsStockEffect         bool   `json:"owns_stock_effect"`
	AuditAction             string `json:"audit_action"`
}

type EventSpec struct {
	Type            string     `json:"type"`
	Version         int        `json:"version"`
	Module          string     `json:"module"`
	Class           EventClass `json:"class"`
	AccountingOwner string     `json:"accounting_owner,omitempty"`
	StockOwner      string     `json:"stock_owner,omitempty"`
}

type JobSpec struct {
	Type        string `json:"type"`
	Version     int    `json:"version"`
	Module      string `json:"module"`
	MaxAttempts int    `json:"max_attempts"`
}

type NotificationTemplateSpec struct {
	Key            string `json:"key"`
	Version        int    `json:"version"`
	Category       string `json:"category"`
	Severity       string `json:"severity"`
	SourceEvent    string `json:"source_event"`
	Mandatory      bool   `json:"mandatory"`
	ReviewItemType string `json:"review_item_type,omitempty"`
}

var Commands = []CommandSpec{
	// Identity & Security
	{Type: "identity.account.register", Version: 1, Module: "identity", IdempotencyRequired: true, EmitsEvent: "identity.account.registered", AuditAction: "account_registered"},
	{Type: "identity.contact.add", Version: 1, Module: "identity", Permission: "account.security.manage", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "identity.contact.added", AuditAction: "contact_added"},
	{Type: "identity.contact.verify", Version: 1, Module: "identity", IdempotencyRequired: true, EmitsEvent: "identity.contact.verified", AuditAction: "contact_verified"},
	{Type: "identity.contact.make_primary", Version: 1, Module: "identity", Permission: "account.security.manage", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "identity.contact.primary_changed", AuditAction: "contact_primary_changed"},
	{Type: "identity.contact.remove", Version: 1, Module: "identity", Permission: "account.security.manage", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "identity.contact.removed", AuditAction: "contact_removed"},
	{Type: "identity.profile.update", Version: 1, Module: "identity", Permission: "account.profile.manage", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "identity.profile.updated", AuditAction: "profile_updated"},
	{Type: "auth.session.revoke", Version: 1, Module: "identity", Permission: "sessions.manage", IdempotencyRequired: true, EmitsEvent: "auth.session.revoked", AuditAction: "session_revoked"},
	{Type: "auth.sessions.revoke_others", Version: 1, Module: "identity", Permission: "sessions.manage", IdempotencyRequired: true, EmitsEvent: "auth.sessions.others_revoked", AuditAction: "other_sessions_revoked"},
	// Members & Ownership
	{Type: "members.invitation.create", Version: 1, Module: "workspaces", Permission: "members.manage", Entitlement: "business.staff.active.max", IdempotencyRequired: true, EmitsEvent: "members.invitation.created", AuditAction: "member_invited"},
	{Type: "members.invitation.accept", Version: 1, Module: "workspaces", IdempotencyRequired: true, EmitsEvent: "members.invitation.accepted", AuditAction: "member_joined"},
	{Type: "members.membership.change_access", Version: 1, Module: "workspaces", Permission: "members.manage", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "members.membership.access_changed", AuditAction: "member_access_changed"},
	{Type: "members.membership.suspend", Version: 1, Module: "workspaces", Permission: "members.manage", IdempotencyRequired: true, EmitsEvent: "members.membership.suspended", AuditAction: "member_suspended"},
	{Type: "members.membership.remove", Version: 1, Module: "workspaces", Permission: "members.manage", IdempotencyRequired: true, EmitsEvent: "members.membership.removed", AuditAction: "member_removed"},
	{Type: "members.ownership_transfer.request", Version: 1, Module: "workspaces", Permission: "ownership.transfer", IdempotencyRequired: true, EmitsEvent: "members.ownership_transfer.requested", AuditAction: "ownership_transfer_initiated"},
	{Type: "members.ownership_transfer.accept", Version: 1, Module: "workspaces", IdempotencyRequired: true, EmitsEvent: "members.ownership_transfer.accepted", AuditAction: "business_ownership_transferred"},
	// Money & Payments
	{Type: "money.draft.create", Version: 1, Module: "money", Permission: "money.create", IdempotencyRequired: true, EmitsEvent: "money.draft.created", AuditAction: "money_draft_created"},
	{Type: "money.entry.confirm", Version: 1, Module: "money", Permission: "money.create", Entitlement: "records.confirmed.monthly", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "money.entry.confirmed", OwnsAccountingEffect: true, AuditAction: "money_entry_confirmed"},
	{Type: "money.entry.reverse", Version: 1, Module: "money", Permission: "money.void", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "money.entry.reversed", OwnsAccountingEffect: true, AuditAction: "money_entry_reversed"},
	{Type: "payments.payment.record", Version: 1, Module: "payments", Permission: "sales.create", IdempotencyRequired: true, EmitsEvent: "payments.payment.recorded", OwnsAccountingEffect: true, AuditAction: "payment_recorded"},
	{Type: "payments.payment.allocate", Version: 1, Module: "payments", Permission: "sales.create", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "payments.payment.allocated", OwnsAccountingEffect: true, AuditAction: "payment_allocated"},
	// Sales, Purchasing & Inventory
	{Type: "sales.invoice.issue", Version: 1, Module: "sales", Permission: "invoices.create", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "sales.invoice.issued", OwnsAccountingEffect: true, AuditAction: "invoice_issued"},
	{Type: "sales.sale.confirm", Version: 1, Module: "sales", Permission: "sales.create", IdempotencyRequired: true, EmitsEvent: "sales.sale.confirmed", OwnsAccountingEffect: true, OwnsStockEffect: true, AuditAction: "sale_confirmed"},
	{Type: "purchasing.receipt.post", Version: 1, Module: "purchasing", Permission: "purchases.create", Entitlement: "business.procurement.enabled", IdempotencyRequired: true, EmitsEvent: "purchasing.receipt.posted", OwnsAccountingEffect: true, OwnsStockEffect: true, AuditAction: "goods_receipt_posted"},
	{Type: "purchasing.bill.post", Version: 1, Module: "purchasing", Permission: "purchases.create", Entitlement: "business.procurement.enabled", IdempotencyRequired: true, EmitsEvent: "purchasing.bill.posted", OwnsAccountingEffect: true, AuditAction: "supplier_bill_posted"},
	{Type: "inventory.transfer.dispatch", Version: 1, Module: "inventory", Permission: "inventory.view_quantity", Entitlement: "business.inventory.enabled", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "inventory.transfer.dispatched", OwnsStockEffect: true, AuditAction: "inventory_transfer_dispatched"},
	{Type: "inventory.transfer.receive", Version: 1, Module: "inventory", Permission: "inventory.view_quantity", Entitlement: "business.inventory.enabled", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "inventory.transfer.received", OwnsStockEffect: true, AuditAction: "inventory_transfer_received"},
	// Personal & Ledger
	{Type: "personal.account.opening_balance.record", Version: 1, Module: "personal", Permission: "money.create", IdempotencyRequired: true, EmitsEvent: "personal.account.opening_balance_recorded", OwnsAccountingEffect: true, AuditAction: "opening_balance_recorded"},
	{Type: "personal.loan.repayment", Version: 1, Module: "personal", Permission: "money.create", Entitlement: "personal.loans.enabled", IdempotencyRequired: true, EmitsEvent: "personal.loan.repaid", OwnsAccountingEffect: true, AuditAction: "loan_repayment_recorded"},
	{Type: "ledger.period.lock", Version: 1, Module: "ledger", Permission: "period.lock", IdempotencyRequired: true, EmitsEvent: "ledger.period.locked", AuditAction: "period_locked"},
	{Type: "ledger.manual_journal.approve", Version: 1, Module: "ledger", Permission: "journal.approve_manual", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "ledger.manual_journal.approved", OwnsAccountingEffect: true, AuditAction: "manual_journal_approved"},
	// AI, Imports, Billing, Documents, Sync, Privacy, Support & Ops
	{Type: "ai.draft.create", Version: 1, Module: "aiimports", Permission: "ai.use", Entitlement: "ai.draft.monthly", IdempotencyRequired: true, EmitsEvent: "ai.draft.created", AuditAction: "ai_draft_created"},
	{Type: "imports.batch.create", Version: 1, Module: "aiimports", Permission: "imports.create", Entitlement: "csv.import.enabled", IdempotencyRequired: true, EmitsEvent: "imports.batch.created", AuditAction: "import_batch_created"},
	{Type: "billing.checkout.create", Version: 1, Module: "billing", Permission: "billing.manage_plan", IdempotencyRequired: true, EmitsEvent: "billing.checkout.created", AuditAction: "billing_checkout_created"},
	{Type: "documents.render.request", Version: 1, Module: "documents", Permission: "documents.render", IdempotencyRequired: true, ExpectedVersionRequired: true, EmitsEvent: "documents.render.requested", AuditAction: "document_render_requested"},
	{Type: "sharing.grant.create", Version: 1, Module: "documents", Permission: "shares.create", IdempotencyRequired: true, EmitsEvent: "sharing.grant.created", AuditAction: "share_grant_created"},
	{Type: "sharing.grant.revoke", Version: 1, Module: "documents", Permission: "shares.revoke", IdempotencyRequired: true, EmitsEvent: "sharing.grant.revoked", AuditAction: "share_grant_revoked"},
	{Type: "sync.session.start", Version: 1, Module: "sync", Entitlement: "offline.mode", IdempotencyRequired: false, EmitsEvent: "sync.session.started", AuditAction: "sync_session_started"},
	{Type: "privacy.export.request", Version: 1, Module: "privacy", Permission: "exports.complete", IdempotencyRequired: true, EmitsEvent: "privacy.export.requested", AuditAction: "ownership_export_created"},
	{Type: "privacy.deletion.request", Version: 1, Module: "privacy", Permission: "deletion.request", IdempotencyRequired: true, EmitsEvent: "privacy.deletion.requested", AuditAction: "deletion_requested"},
	{Type: "privacy.deletion.cancel", Version: 1, Module: "privacy", Permission: "deletion.request", IdempotencyRequired: true, EmitsEvent: "privacy.deletion.cancelled", AuditAction: "deletion_cancelled_restored"},
	{Type: "support.case.create", Version: 1, Module: "support", Permission: "support.intake", IdempotencyRequired: true, EmitsEvent: "support.case.created", AuditAction: "support_case_created"},
	{Type: "support.access_grant.create", Version: 1, Module: "support", Permission: "support.access.grant", IdempotencyRequired: true, EmitsEvent: "support.access_grant.created", AuditAction: "support_access_granted"},
	{Type: "support.access_grant.revoke", Version: 1, Module: "support", Permission: "support.access.grant", IdempotencyRequired: true, EmitsEvent: "support.access_grant.revoked", AuditAction: "support_access_revoked"},
	{Type: "operations.job.retry", Version: 1, Module: "operations", Permission: "admin.recovery", IdempotencyRequired: true, EmitsEvent: "operations.job.retry_requested", AuditAction: "admin_job_retried"},
	{Type: "operations.reconciliation.run", Version: 1, Module: "operations", Permission: "admin.recovery", IdempotencyRequired: true, EmitsEvent: "operations.reconciliation.requested", AuditAction: "admin_reconciliation_run"},
}

var Events = []EventSpec{
	{Type: "identity.account.registered", Version: 1, Module: "identity", Class: ClassDomainEvent},
	{Type: "identity.contact.added", Version: 1, Module: "identity", Class: ClassSecurityEvent},
	{Type: "identity.contact.verified", Version: 1, Module: "identity", Class: ClassSecurityEvent},
	{Type: "identity.contact.primary_changed", Version: 1, Module: "identity", Class: ClassSecurityEvent},
	{Type: "identity.contact.removed", Version: 1, Module: "identity", Class: ClassSecurityEvent},
	{Type: "identity.profile.updated", Version: 1, Module: "identity", Class: ClassDomainEvent},
	{Type: "auth.session.revoked", Version: 1, Module: "identity", Class: ClassSecurityEvent},
	{Type: "auth.sessions.others_revoked", Version: 1, Module: "identity", Class: ClassSecurityEvent},
	{Type: "members.invitation.created", Version: 1, Module: "workspaces", Class: ClassDomainEvent},
	{Type: "members.invitation.accepted", Version: 1, Module: "workspaces", Class: ClassDomainEvent},
	{Type: "members.membership.access_changed", Version: 1, Module: "workspaces", Class: ClassSecurityEvent},
	{Type: "members.membership.suspended", Version: 1, Module: "workspaces", Class: ClassSecurityEvent},
	{Type: "members.membership.removed", Version: 1, Module: "workspaces", Class: ClassSecurityEvent},
	{Type: "members.ownership_transfer.requested", Version: 1, Module: "workspaces", Class: ClassSecurityEvent},
	{Type: "members.ownership_transfer.accepted", Version: 1, Module: "workspaces", Class: ClassSecurityEvent},
	{Type: "money.draft.created", Version: 1, Module: "money", Class: ClassDomainEvent},
	{Type: "money.entry.confirmed", Version: 1, Module: "money", Class: ClassDomainEvent, AccountingOwner: "money.entry.confirm"},
	{Type: "money.entry.reversed", Version: 1, Module: "money", Class: ClassDomainEvent, AccountingOwner: "money.entry.reverse"},
	{Type: "payments.payment.recorded", Version: 1, Module: "payments", Class: ClassDomainEvent, AccountingOwner: "payments.payment.record"},
	{Type: "payments.payment.allocated", Version: 1, Module: "payments", Class: ClassDomainEvent, AccountingOwner: "payments.payment.allocate"},
	{Type: "sales.invoice.issued", Version: 1, Module: "sales", Class: ClassDomainEvent, AccountingOwner: "sales.invoice.issue"},
	{Type: "sales.sale.confirmed", Version: 1, Module: "sales", Class: ClassDomainEvent, AccountingOwner: "sales.sale.confirm", StockOwner: "sales.sale.confirm"},
	{Type: "purchasing.receipt.posted", Version: 1, Module: "purchasing", Class: ClassDomainEvent, AccountingOwner: "purchasing.receipt.post", StockOwner: "purchasing.receipt.post"},
	{Type: "purchasing.bill.posted", Version: 1, Module: "purchasing", Class: ClassDomainEvent, AccountingOwner: "purchasing.bill.post"},
	{Type: "inventory.transfer.dispatched", Version: 1, Module: "inventory", Class: ClassDomainEvent, StockOwner: "inventory.transfer.dispatch"},
	{Type: "inventory.transfer.received", Version: 1, Module: "inventory", Class: ClassDomainEvent, StockOwner: "inventory.transfer.receive"},
	{Type: "personal.account.opening_balance_recorded", Version: 1, Module: "personal", Class: ClassDomainEvent, AccountingOwner: "personal.account.opening_balance.record"},
	{Type: "personal.loan.repaid", Version: 1, Module: "personal", Class: ClassDomainEvent, AccountingOwner: "personal.loan.repayment"},
	{Type: "ledger.period.locked", Version: 1, Module: "ledger", Class: ClassDomainEvent},
	{Type: "ledger.manual_journal.approved", Version: 1, Module: "ledger", Class: ClassDomainEvent, AccountingOwner: "ledger.manual_journal.approve"},
	{Type: "ai.draft.created", Version: 1, Module: "aiimports", Class: ClassDomainEvent},
	{Type: "imports.batch.created", Version: 1, Module: "aiimports", Class: ClassDomainEvent},
	{Type: "billing.checkout.created", Version: 1, Module: "billing", Class: ClassDomainEvent},
	{Type: "documents.render.requested", Version: 1, Module: "documents", Class: ClassIntegrationEvent},
	{Type: "sharing.grant.created", Version: 1, Module: "documents", Class: ClassDomainEvent},
	{Type: "sharing.grant.revoked", Version: 1, Module: "documents", Class: ClassDomainEvent},
	{Type: "sync.session.started", Version: 1, Module: "sync", Class: ClassDomainEvent},
	{Type: "privacy.export.requested", Version: 1, Module: "privacy", Class: ClassDomainEvent},
	{Type: "privacy.deletion.requested", Version: 1, Module: "privacy", Class: ClassSecurityEvent},
	{Type: "privacy.deletion.cancelled", Version: 1, Module: "privacy", Class: ClassSecurityEvent},
	{Type: "support.case.created", Version: 1, Module: "support", Class: ClassDomainEvent},
	{Type: "support.access_grant.created", Version: 1, Module: "support", Class: ClassSecurityEvent},
	{Type: "support.access_grant.revoked", Version: 1, Module: "support", Class: ClassSecurityEvent},
	{Type: "operations.job.retry_requested", Version: 1, Module: "operations", Class: ClassAuditEvent},
	{Type: "operations.reconciliation.requested", Version: 1, Module: "operations", Class: ClassAuditEvent},
}

var Jobs = []JobSpec{
	{Type: "documents.pdf.render", Version: 1, Module: "documents", MaxAttempts: 5},
	{Type: "notifications.email.send", Version: 1, Module: "documents", MaxAttempts: 5},
	{Type: "privacy.export.generate", Version: 1, Module: "privacy", MaxAttempts: 3},
	{Type: "privacy.deletion.purge_subject", Version: 1, Module: "privacy", MaxAttempts: 5},
	{Type: "operations.reconciliation.run", Version: 1, Module: "operations", MaxAttempts: 3},
}

var ReviewItemTypes = []string{
	"money.classification_required",
	"money.suspense_resolution_required",
	"payments.allocation_conflict",
	"payments.reconciliation_required",
	"parties.duplicate_or_merge_review",
	"parties.claim_disputed",
	"sales.document_conflict",
	"sales.delivery_failed",
	"inventory.low_stock",
	"inventory.count_variance",
	"inventory.transfer_dispute",
	"purchasing.approval_required",
	"purchasing.match_variance",
	"purchasing.duplicate_bill",
	"commerce.order_review",
	"commerce.domain_error",
	"ai.clarification_required",
	"imports.row_conflict",
	"offline.sync_conflict",
	"billing.payment_recovery",
	"files.quarantine_or_delete_failure",
	"privacy.deletion_or_export_failure",
	"operations.reconciliation_finding",
}

var NotificationTemplates = []NotificationTemplateSpec{
	{Key: "security.contact_changed", Version: 1, Category: "security", Severity: "high", SourceEvent: "identity.contact.primary_changed", Mandatory: true},
	{Key: "sales.delivery_failed", Version: 1, Category: "sales", Severity: "warning", SourceEvent: "sales.delivery_failed", Mandatory: false, ReviewItemType: "sales.delivery_failed"},
	{Key: "billing.renewal_failed", Version: 1, Category: "billing", Severity: "high", SourceEvent: "billing.subscription.payment_failed", Mandatory: true, ReviewItemType: "billing.payment_recovery"},
	{Key: "privacy.deletion_requested", Version: 1, Category: "privacy", Severity: "high", SourceEvent: "privacy.deletion.requested", Mandatory: true},
	{Key: "operations.reconciliation_alert", Version: 1, Category: "operations", Severity: "critical", SourceEvent: "operations.reconciliation.requested", Mandatory: true, ReviewItemType: "operations.reconciliation_finding"},
}

var ErrorCodes = []string{
	"UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "IDEMPOTENCY_CONFLICT",
	"RECENT_AUTH_REQUIRED", "CONTACT_ALREADY_IN_USE", "CONTACT_VERIFICATION_REQUIRED",
	"LAST_LOGIN_METHOD", "SESSION_ALREADY_REVOKED", "SETTINGS_VERSION_CONFLICT",
	"SETTING_LOCKED_AFTER_POSTING", "LAST_OWNER_REQUIRED", "OWNERSHIP_TRANSFER_PENDING",
	"INVITATION_EXPIRED", "EXPORT_NOT_READY", "EXPORT_RECONCILIATION_FAILED",
	"DELETION_DEPENDENCY_UNRESOLVED", "DELETION_ALREADY_REQUESTED", "DELETION_GRACE_EXPIRED",
	"DELETION_PURGE_STARTED", "RETENTION_HOLD_ACTIVE", "SUPPORT_VERIFICATION_REQUIRED",
	"SUPPORT_ACCESS_EXPIRED", "OFFLINE_COMMAND_NOT_ALLOWED", "OFFLINE_QUEUE_LIMIT_REACHED",
	"INVALID_STATE_TRANSITION",
}

var forbiddenAnalyticsKeys = map[string]struct{}{
	"amount": {}, "amount_minor": {}, "narration": {}, "prompt": {}, "party_name": {},
	"email": {}, "phone": {}, "account_number": {}, "otp": {}, "token": {},
	"password": {}, "filename": {}, "private_url": {}, "document_content": {},
}

func ValidateCommand(cmdType string, version int) (CommandSpec, error) {
	for _, c := range Commands {
		if c.Type == cmdType && c.Version == version {
			return c, nil
		}
	}
	return CommandSpec{}, fmt.Errorf("UNSUPPORTED_COMMAND_VERSION: %s v%d", cmdType, version)
}

func ValidateEvent(eventType string, version int) (EventSpec, error) {
	for _, e := range Events {
		if e.Type == eventType && e.Version == version {
			return e, nil
		}
	}
	return EventSpec{}, fmt.Errorf("UNSUPPORTED_EVENT_VERSION: %s v%d", eventType, version)
}

func ValidateJob(jobType string, version int) (JobSpec, error) {
	for _, j := range Jobs {
		if j.Type == jobType && j.Version == version {
			return j, nil
		}
	}
	return JobSpec{}, fmt.Errorf("UNSUPPORTED_JOB_VERSION: %s v%d", jobType, version)
}

func ValidateAnalyticsProperties(props map[string]any) error {
	for k := range props {
		if _, bad := forbiddenAnalyticsKeys[strings.ToLower(strings.TrimSpace(k))]; bad {
			return fmt.Errorf("FORBIDDEN_ANALYTICS_PROPERTY: %s", k)
		}
	}
	return nil
}
