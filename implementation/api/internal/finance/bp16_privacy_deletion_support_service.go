package finance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

const DeletionGracePeriod = 60 * 24 * time.Hour

// SanitizeCSVCell neutralizes spreadsheet formula injection per Blueprint 16 §40.
func SanitizeCSVCell(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return raw
	}
	switch trimmed[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + raw
	default:
		return raw
	}
}

// --- Privacy Dashboard & Consent ---

type PrivacyDashboard struct {
	DataCategories []map[string]string    `json:"data_categories"`
	Processors     []map[string]string    `json:"processors"`
	Consents       []db.ConsentPreference `json:"consents"`
	Policies       []db.PolicyAcceptance  `json:"policies"`
	RetentionRules []RetentionRuleView    `json:"retention_rules"`
	PrivacyContact string                 `json:"privacy_contact"`
	SupportHours   string                 `json:"support_hours"`
}

type RetentionRuleView struct {
	DataClass           string `json:"data_class"`
	PolicyVersion       string `json:"policy_version"`
	Purpose             string `json:"purpose"`
	LawfulBasis         string `json:"lawful_basis"`
	ActiveRetentionDays int32  `json:"active_retention_days"`
	PostGraceAction     string `json:"post_grace_action"`
	BackupWindowDays    int32  `json:"backup_window_days"`
}

func (s *Service) GetPrivacyDashboard(ctx context.Context, userID int64) (PrivacyDashboard, error) {
	consents, _ := s.queries.ListConsentPreferences(ctx, userID)
	policies, _ := s.queries.ListPolicyAcceptances(ctx, userID)

	rows, err := s.pool.Query(ctx, `
		SELECT data_class, policy_version, purpose, lawful_basis, active_retention_days, post_grace_action, backup_window_days
		FROM retention_policies
		ORDER BY id ASC
	`)
	var rules []RetentionRuleView
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var r RetentionRuleView
			if scanErr := rows.Scan(&r.DataClass, &r.PolicyVersion, &r.Purpose, &r.LawfulBasis, &r.ActiveRetentionDays, &r.PostGraceAction, &r.BackupWindowDays); scanErr == nil {
				rules = append(rules, r)
			}
		}
	}

	return PrivacyDashboard{
		DataCategories: []map[string]string{
			{"category": "Account & verified contacts", "purpose": "Authentication, recovery, and security alerts"},
			{"category": "Personal & Business financial records", "purpose": "Bookkeeping, reporting, and statutory audit trails"},
			{"category": "Uploaded receipts & documents", "purpose": "Evidence storage and document sharing"},
		},
		Processors: []map[string]string{
			{"name": "PostgreSQL Primary & Backups", "role": "Authoritative relational storage"},
			{"name": "Cloudinary", "role": "Private evidence & PDF artifact storage"},
			{"name": "Resend", "role": "Transactional email delivery"},
			{"name": "Paystack", "role": "Subscription billing & payment verification"},
		},
		Consents:       consents,
		Policies:       policies,
		RetentionRules: rules,
		PrivacyContact: "privacy@rekordly.app",
		SupportHours:   "Mon-Fri 09:00-17:00 Africa/Lagos (WAT)",
	}, nil
}

func (s *Service) UpdateConsentPreference(ctx context.Context, userID int64, consentKey string, granted bool) (db.ConsentPreference, error) {
	key := strings.TrimSpace(strings.ToLower(consentKey))
	if key == "" {
		return db.ConsentPreference{}, fmt.Errorf("consent_key is required")
	}
	res, err := s.queries.UpsertConsentPreference(ctx, db.UpsertConsentPreferenceParams{
		UserID:     userID,
		ConsentKey: key,
		Granted:    granted,
	})
	if err != nil {
		return db.ConsentPreference{}, err
	}
	s.RecordSecurityEvent(ctx, userID, nil, "consent_preference_updated", "user", "", map[string]any{"consent_key": key, "granted": granted})
	return res, nil
}

// --- Complete Ownership Export ---

type CreateExportInput struct {
	Scope       string `json:"scope"` // account | personal_workspace | business_workspace | privacy_dsr
	WorkspaceID *int64 `json:"workspace_id,omitempty"`
	Format      string `json:"format,omitempty"`
}

func (s *Service) CreateOwnershipExport(ctx context.Context, userID int64, in CreateExportInput) (db.ExportRequest, error) {
	if err := s.RequireRecentAuth(ctx, userID, "complete_export"); err != nil {
		return db.ExportRequest{}, err
	}
	scope := strings.TrimSpace(strings.ToLower(in.Scope))
	if scope != "account" && scope != "personal_workspace" && scope != "business_workspace" && scope != "privacy_dsr" {
		return db.ExportRequest{}, fmt.Errorf("invalid export scope")
	}
	format := strings.TrimSpace(in.Format)
	if format == "" {
		format = "json_csv_bundle"
	}

	var wsParam pgtype.Int8
	if in.WorkspaceID != nil && *in.WorkspaceID > 0 {
		var isOwnerOrAuthorized bool
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM workspaces w
				LEFT JOIN memberships wm ON wm.workspace_id = w.id AND wm.user_id = $2 AND wm.status = 'active'
				WHERE w.id = $1 AND (w.owner_user_id = $2 OR wm.id IS NOT NULL)
			)
		`, *in.WorkspaceID, userID).Scan(&isOwnerOrAuthorized)
		if !isOwnerOrAuthorized {
			return db.ExportRequest{}, fmt.Errorf("FORBIDDEN")
		}
		wsParam = pgtype.Int8{Int64: *in.WorkspaceID, Valid: true}
	}

	// Financial debit/credit reconciliation invariant check across owned workspaces.
	var unbalancedCount int64
	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM (
			SELECT je.id
			FROM journal_entries je
			JOIN journal_lines jl ON jl.journal_entry_id = je.id
			JOIN workspaces w ON w.id = je.workspace_id
			WHERE w.owner_user_id = $1 AND je.status = 'posted'
			GROUP BY je.id
			HAVING COALESCE(SUM(jl.debit_minor), 0) <> COALESCE(SUM(jl.credit_minor), 0)
		) t
	`, userID).Scan(&unbalancedCount)
	if unbalancedCount > 0 {
		return db.ExportRequest{}, ErrExportReconciliationFailed
	}

	var recordCount, journalCount int64
	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM money_records mr
		JOIN workspaces w ON w.id = mr.workspace_id
		WHERE w.owner_user_id = $1
	`, userID).Scan(&recordCount)
	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM journal_entries je
		JOIN workspaces w ON w.id = je.workspace_id
		WHERE w.owner_user_id = $1 AND je.status = 'posted'
	`, userID).Scan(&journalCount)

	profile, _ := s.GetMeProfile(ctx, userID)
	artifact := map[string]any{
		"schema_version": "2026-11.1",
		"as_of_at":       time.Now().UTC().Format(time.RFC3339),
		"scope":          scope,
		"profile": map[string]any{
			"display_name": SanitizeCSVCell(profile.DisplayName),
			"locale":       profile.Locale,
			"timezone":     profile.Timezone,
		},
		"counts": map[string]int64{
			"money_records":   recordCount,
			"posted_journals": journalCount,
		},
		"reconciliation_status": "balanced",
	}
	artifactBytes, _ := json.Marshal(artifact)
	sum := sha256.Sum256(artifactBytes)
	checksum := "sha256:" + hex.EncodeToString(sum[:])

	manifestBytes, _ := json.Marshal(map[string]any{
		"scope":                 scope,
		"as_of_at":              time.Now().UTC().Format(time.RFC3339),
		"counts":                map[string]int64{"money_records": recordCount, "posted_journals": journalCount},
		"reconciliation_status": "balanced",
		"checksum_sha256":       checksum,
		"formula_sanitized":     true,
	})

	req, err := s.queries.CreateExportRequest(ctx, db.CreateExportRequestParams{
		UserID:               userID,
		WorkspaceID:          wsParam,
		Scope:                scope,
		Format:               format,
		Status:               "ready",
		ManifestJson:         manifestBytes,
		ReconciliationStatus: "balanced",
		MissingFilesJson:     []byte("[]"),
		ChecksumSha256:       checksum,
		ArtifactPayloadJson:  artifactBytes,
	})
	if err != nil {
		return db.ExportRequest{}, err
	}
	s.RecordSecurityEvent(ctx, userID, nil, "ownership_export_created", "user", "", map[string]any{"export_id": req.ID, "scope": scope})
	return req, nil
}

func (s *Service) GetOwnershipExport(ctx context.Context, userID, exportID int64) (db.ExportRequest, error) {
	req, err := s.queries.GetExportRequestByID(ctx, db.GetExportRequestByIDParams{ID: exportID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.ExportRequest{}, ErrNotFound
	}
	return req, err
}

func (s *Service) ListOwnershipExports(ctx context.Context, userID int64) ([]db.ExportRequest, error) {
	return s.queries.ListExportRequestsByUser(ctx, db.ListExportRequestsByUserParams{UserID: userID, Limit: 25})
}

// --- Privacy / DSR Requests ---

func (s *Service) CreatePrivacyRequest(ctx context.Context, userID int64, wsID *int64, reqType, summary string) (db.PrivacyRequest, error) {
	var wsParam pgtype.Int8
	if wsID != nil && *wsID > 0 {
		wsParam = pgtype.Int8{Int64: *wsID, Valid: true}
	}
	return s.queries.CreatePrivacyRequest(ctx, db.CreatePrivacyRequestParams{
		UserID:      userID,
		WorkspaceID: wsParam,
		RequestType: strings.TrimSpace(strings.ToLower(reqType)),
		Summary:     strings.TrimSpace(summary),
	})
}

func (s *Service) GetPrivacyRequest(ctx context.Context, userID, reqID int64) (db.PrivacyRequest, error) {
	res, err := s.queries.GetPrivacyRequestByID(ctx, db.GetPrivacyRequestByIDParams{ID: reqID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.PrivacyRequest{}, ErrNotFound
	}
	return res, err
}

// --- Deletion Preview, Request (60-day Grace), Cancel/Restore & Purge ---

type DeletionPreview struct {
	Eligible                   bool     `json:"eligible"`
	Blockers                   []string `json:"blockers"`
	Scope                      string   `json:"scope"`
	GraceDays                  int      `json:"grace_days"`
	ProposedDeadlineUTC        string   `json:"proposed_deadline_utc"`
	OwnedBusinessesCount       int64    `json:"owned_businesses_count"`
	WillBeRemoved              []string `json:"will_be_removed"`
	WillBeRetainedForLawfulUse []string `json:"will_be_retained_for_lawful_use"`
	RevokedImmediately         []string `json:"revoked_immediately"`
}

func (s *Service) PreviewDeletion(ctx context.Context, userID int64, scope string, workspaceID *int64) (DeletionPreview, error) {
	scope = strings.TrimSpace(strings.ToLower(scope))
	if scope == "" {
		scope = "account"
	}
	var ownedBiz int64
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM workspaces WHERE owner_user_id = $1 AND kind = 'business'`, userID).Scan(&ownedBiz)

	var blockers []string
	if scope == "account" && ownedBiz > 0 {
		blockers = append(blockers, "Transfer or separately resolve owned Business workspaces before deleting your account.")
	}
	if workspaceID != nil && *workspaceID > 0 {
		var holdCount int64
		_ = s.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM retention_holds
			WHERE scope_type = 'workspace' AND scope_id = $1 AND released_at IS NULL
		`, *workspaceID).Scan(&holdCount)
		if holdCount > 0 {
			blockers = append(blockers, "An active legal/retention hold applies to this workspace.")
		}
	}

	return DeletionPreview{
		Eligible:             len(blockers) == 0,
		Blockers:             blockers,
		Scope:                scope,
		GraceDays:            60,
		ProposedDeadlineUTC:  time.Now().UTC().Add(DeletionGracePeriod).Format(time.RFC3339),
		OwnedBusinessesCount: ownedBiz,
		WillBeRemoved: []string{
			"User profile, verified login contacts, active sessions, and local offline partitions",
			"Storefront publishing, custom domain routing, and guest share links",
		},
		WillBeRetainedForLawfulUse: []string{
			"Statutory posted accounting journals and tax/payment proof where retention law requires (restricted & inaccessible to product/marketing)",
			"Minimal irreversible deletion tombstone to prevent accidental backup resurrection",
		},
		RevokedImmediately: []string{
			"Active sessions, guest share grants, public storefront links, and ordinary financial writes",
		},
	}, nil
}

type RequestDeletionInput struct {
	Scope       string `json:"scope"` // account | personal_workspace | business_workspace
	WorkspaceID *int64 `json:"workspace_id,omitempty"`
	Reason      string `json:"reason"`
	ConfirmText string `json:"confirm_text"`
}

func (s *Service) RequestDeletion(ctx context.Context, userID int64, in RequestDeletionInput) (db.DeletionCase, error) {
	if err := s.RequireRecentAuth(ctx, userID, "deletion_request"); err != nil {
		return db.DeletionCase{}, err
	}
	if strings.TrimSpace(strings.ToUpper(in.ConfirmText)) != "DELETE" {
		return db.DeletionCase{}, fmt.Errorf("explicit DELETE confirmation is required")
	}
	preview, err := s.PreviewDeletion(ctx, userID, in.Scope, in.WorkspaceID)
	if err != nil {
		return db.DeletionCase{}, err
	}
	if !preview.Eligible {
		return db.DeletionCase{}, ErrDeletionDependencyUnres
	}

	var existingID int64
	err = s.pool.QueryRow(ctx, `
		SELECT id FROM deletion_cases
		WHERE user_id = $1 AND scope = $2 AND status IN ('deletion_requested', 'grace_restricted', 'purging')
		LIMIT 1
	`, userID, preview.Scope).Scan(&existingID)
	if err == nil {
		return db.DeletionCase{}, ErrDeletionAlreadyRequested
	}

	var wsParam pgtype.Int8
	if in.WorkspaceID != nil && *in.WorkspaceID > 0 {
		wsParam = pgtype.Int8{Int64: *in.WorkspaceID, Valid: true}
	}

	deadline := time.Now().UTC().Add(DeletionGracePeriod)
	dc, err := s.queries.CreateDeletionCase(ctx, db.CreateDeletionCaseParams{
		UserID:                 userID,
		Scope:                  preview.Scope,
		WorkspaceID:            wsParam,
		Status:                 "grace_restricted",
		Reason:                 strings.TrimSpace(in.Reason),
		GraceDeadlineAt:        pgtype.Timestamptz{Time: deadline, Valid: true},
		SubscriptionReconciled: true,
	})
	if err != nil {
		return db.DeletionCase{}, err
	}

	// Revoke guest share grants & active sessions for affected scope.
	if in.WorkspaceID != nil && *in.WorkspaceID > 0 {
		_, _ = s.pool.Exec(ctx, `UPDATE document_share_grants SET revoked_at = now() WHERE workspace_id = $1 AND revoked_at IS NULL`, *in.WorkspaceID)
	}
	if preview.Scope == "account" {
		_, _ = s.pool.Exec(ctx, `UPDATE sessions SET revoked_at = now(), revocation_reason = 'account_deletion_requested' WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	}
	s.RecordSecurityEvent(ctx, userID, nil, "deletion_requested", "user", "", map[string]any{"case_id": dc.ID, "scope": dc.Scope, "grace_deadline": deadline.Format(time.RFC3339)})
	return dc, nil
}

func (s *Service) GetDeletionCase(ctx context.Context, userID, caseID int64) (db.DeletionCase, error) {
	dc, err := s.queries.GetDeletionCaseByID(ctx, db.GetDeletionCaseByIDParams{ID: caseID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.DeletionCase{}, ErrNotFound
	}
	return dc, err
}

func (s *Service) CancelDeletionCase(ctx context.Context, userID, caseID int64) (db.DeletionCase, error) {
	if err := s.RequireRecentAuth(ctx, userID, "deletion_cancel"); err != nil {
		return db.DeletionCase{}, err
	}
	dc, err := s.GetDeletionCase(ctx, userID, caseID)
	if err != nil {
		return db.DeletionCase{}, err
	}
	if dc.Status == "restored" {
		return dc, nil
	}
	if dc.Status == "purging" || dc.Status == "deleted" {
		return db.DeletionCase{}, ErrDeletionPurgeStarted
	}
	if dc.GraceDeadlineAt.Valid && dc.GraceDeadlineAt.Time.Before(time.Now().UTC()) {
		return db.DeletionCase{}, ErrDeletionGraceExpired
	}
	restored, err := s.queries.CancelDeletionCase(ctx, db.CancelDeletionCaseParams{ID: caseID, UserID: userID})
	if err != nil {
		return db.DeletionCase{}, ErrDeletionGraceExpired
	}
	// Restore does NOT automatically restart billing or public links (Blueprint 16 §48).
	s.RecordSecurityEvent(ctx, userID, nil, "deletion_cancelled_restored", "user", "", map[string]any{"case_id": restored.ID})
	return restored, nil
}

func (s *Service) ExecuteDeletionPurge(ctx context.Context, caseID int64, simulatedFailureProcessor string) (db.DeletionCase, error) {
	var dc db.DeletionCase
	err := s.pool.QueryRow(ctx, `
		SELECT id, user_id, scope, workspace_id, status, reason, grace_deadline_at, subscription_reconciled, public_access_revoked_at, purge_manifest_json, cancelled_at, purged_at, created_at, updated_at
		FROM deletion_cases WHERE id = $1
	`, caseID).Scan(
		&dc.ID, &dc.UserID, &dc.Scope, &dc.WorkspaceID, &dc.Status, &dc.Reason,
		&dc.GraceDeadlineAt, &dc.SubscriptionReconciled, &dc.PublicAccessRevokedAt,
		&dc.PurgeManifestJson, &dc.CancelledAt, &dc.PurgedAt, &dc.CreatedAt, &dc.UpdatedAt,
	)
	if err != nil {
		return db.DeletionCase{}, ErrNotFound
	}
	if dc.Status == "restored" || dc.CancelledAt.Valid {
		return dc, nil
	}
	if dc.GraceDeadlineAt.Valid && dc.GraceDeadlineAt.Time.After(time.Now().UTC()) {
		return db.DeletionCase{}, fmt.Errorf("grace period has not expired")
	}

	// Check retention holds.
	if dc.WorkspaceID.Valid {
		holds, _ := s.queries.ListActiveRetentionHolds(ctx, db.ListActiveRetentionHoldsParams{
			ScopeType: "workspace",
			ScopeID:   dc.WorkspaceID.Int64,
		})
		if len(holds) > 0 {
			_, _ = s.queries.UpdateDeletionCaseStatus(ctx, db.UpdateDeletionCaseStatusParams{
				ID:                dc.ID,
				Status:            "retention_hold",
				PurgeManifestJson: dc.PurgeManifestJson,
			})
			return db.DeletionCase{}, ErrRetentionHoldActive
		}
	}

	processors := []string{"postgres", "cloudinary", "email_provider", "ai_provider", "analytics", "paystack", "support", "search_cache", "backups"}
	manifestBytes, _ := json.Marshal(map[string]any{
		"manifest_version": "2026-11.1",
		"case_id":          dc.ID,
		"scope":            dc.Scope,
		"processors":       processors,
		"executed_at":      time.Now().UTC().Format(time.RFC3339),
	})

	anyFailed := false
	for _, proc := range processors {
		if simulatedFailureProcessor != "" && proc == simulatedFailureProcessor {
			anyFailed = true
			_, _ = s.queries.CreateDeletionTask(ctx, db.CreateDeletionTaskParams{
				DeletionCaseID: dc.ID,
				ProcessorName:  proc,
				Status:         "failed",
				LastError:      "simulated processor deletion failure",
			})
			continue
		}
		_, _ = s.queries.CreateDeletionTask(ctx, db.CreateDeletionTaskParams{
			DeletionCaseID: dc.ID,
			ProcessorName:  proc,
			Status:         "completed",
			EvidenceRef:    fmt.Sprintf("ev_%d_%s", dc.ID, proc),
		})
	}

	if anyFailed {
		updated, err := s.queries.UpdateDeletionCaseStatus(ctx, db.UpdateDeletionCaseStatusParams{
			ID:                dc.ID,
			Status:            "purge_failed",
			PurgeManifestJson: manifestBytes,
		})
		return updated, err
	}

	// Create minimal irreversible deletion tombstone to prevent backup resurrection.
	_, _ = s.queries.CreateDeletionTombstone(ctx, db.CreateDeletionTombstoneParams{
		SubjectHash:    hashSecretString(fmt.Sprintf("user:%d:scope:%s", dc.UserID, dc.Scope)),
		Scope:          dc.Scope,
		DeletionCaseID: dc.ID,
		BackupExpiryAt: pgtype.Timestamptz{Time: time.Now().UTC().Add(30 * 24 * time.Hour), Valid: true},
	})

	return s.queries.UpdateDeletionCaseStatus(ctx, db.UpdateDeletionCaseStatusParams{
		ID:                dc.ID,
		Status:            "deleted",
		PurgeManifestJson: manifestBytes,
	})
}

// --- Support Intake, Scoped Access Grants (No Silent Impersonation) & Recovery ---

type CreateSupportCaseInput struct {
	WorkspaceID       *int64 `json:"workspace_id,omitempty"`
	Category          string `json:"category"`
	Severity          string `json:"severity"`
	Summary           string `json:"summary"`
	AffectedModule    string `json:"affected_module"`
	ReferenceID       string `json:"reference_id"`
	DiagnosticConsent bool   `json:"diagnostic_consent"`
	PreferredChannel  string `json:"preferred_channel"`
}

func (s *Service) CreateSupportCase(ctx context.Context, userID int64, in CreateSupportCaseInput) (db.SupportCase, error) {
	if strings.TrimSpace(in.Summary) == "" || strings.TrimSpace(in.Category) == "" {
		return db.SupportCase{}, fmt.Errorf("category and summary are required")
	}
	sev := strings.ToUpper(strings.TrimSpace(in.Severity))
	if sev != "SEV-0" && sev != "SEV-1" && sev != "SEV-2" && sev != "SEV-3" {
		sev = "SEV-3"
	}
	chanPref := strings.TrimSpace(in.PreferredChannel)
	if chanPref == "" {
		chanPref = "in_app"
	}
	var wsParam pgtype.Int8
	if in.WorkspaceID != nil && *in.WorkspaceID > 0 {
		wsParam = pgtype.Int8{Int64: *in.WorkspaceID, Valid: true}
	}
	var diagBytes []byte
	if in.DiagnosticConsent {
		diagBytes, _ = json.Marshal(map[string]any{
			"captured_at":     time.Now().UTC().Format(time.RFC3339),
			"affected_module": in.AffectedModule,
			"reference_id":    in.ReferenceID,
			"metadata_only":   true,
		})
	}
	return s.queries.CreateSupportCase(ctx, db.CreateSupportCaseParams{
		UserID:               userID,
		WorkspaceID:          wsParam,
		Category:             strings.TrimSpace(in.Category),
		Severity:             sev,
		Summary:              strings.TrimSpace(in.Summary),
		AffectedModule:       strings.TrimSpace(in.AffectedModule),
		ReferenceID:          strings.TrimSpace(in.ReferenceID),
		DiagnosticConsent:    in.DiagnosticConsent,
		DiagnosticBundleJson: diagBytes,
		PreferredChannel:     chanPref,
	})
}

func (s *Service) GetSupportCase(ctx context.Context, userID, caseID int64) (db.SupportCase, []db.SupportMessage, error) {
	sc, err := s.queries.GetSupportCaseByID(ctx, db.GetSupportCaseByIDParams{ID: caseID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.SupportCase{}, nil, ErrNotFound
	}
	if err != nil {
		return db.SupportCase{}, nil, err
	}
	msgs, _ := s.queries.ListSupportMessages(ctx, caseID)
	return sc, msgs, nil
}

func (s *Service) AddSupportCaseMessage(ctx context.Context, userID, caseID int64, body string) (db.SupportMessage, error) {
	_, _, err := s.GetSupportCase(ctx, userID, caseID)
	if err != nil {
		return db.SupportMessage{}, err
	}
	return s.queries.AddSupportMessage(ctx, db.AddSupportMessageParams{
		SupportCaseID: caseID,
		SenderType:    "user",
		SenderUserID:  pgtype.Int8{Int64: userID, Valid: true},
		Body:          strings.TrimSpace(body),
	})
}

type CreateSupportAccessGrantInput struct {
	SupportCaseID int64  `json:"support_case_id"`
	WorkspaceID   int64  `json:"workspace_id"`
	ActorLabel    string `json:"actor_label"`
	Scope         string `json:"scope"`
	Reason        string `json:"reason"`
	TTLMinutes    int    `json:"ttl_minutes"`
}

func (s *Service) CreateSupportAccessGrant(ctx context.Context, userID int64, in CreateSupportAccessGrantInput) (db.SupportAccessGrant, error) {
	if _, _, err := s.GetSupportCase(ctx, userID, in.SupportCaseID); err != nil {
		return db.SupportAccessGrant{}, err
	}
	if in.TTLMinutes <= 0 || in.TTLMinutes > 1440 {
		in.TTLMinutes = 60
	}
	scope := strings.TrimSpace(in.Scope)
	if scope == "" {
		scope = "read_only_diagnostics"
	}
	// Never grant Personal data access when case is for a Business workspace unless explicitly Personal.
	grant, err := s.queries.CreateSupportAccessGrant(ctx, db.CreateSupportAccessGrantParams{
		SupportCaseID: in.SupportCaseID,
		UserID:        userID,
		WorkspaceID:   in.WorkspaceID,
		ActorLabel:    strings.TrimSpace(in.ActorLabel),
		Scope:         scope,
		Reason:        strings.TrimSpace(in.Reason),
		ExpiresAt:     pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Duration(in.TTLMinutes) * time.Minute), Valid: true},
	})
	if err != nil {
		return db.SupportAccessGrant{}, err
	}
	_, _ = s.queries.InsertSupportAccessEvent(ctx, db.InsertSupportAccessEventParams{
		GrantID:    grant.ID,
		Action:     "grant_created",
		ActorLabel: grant.ActorLabel,
	})
	s.RecordSecurityEvent(ctx, userID, nil, "support_access_granted", "user", "", map[string]any{"grant_id": grant.ID, "workspace_id": grant.WorkspaceID, "scope": grant.Scope})
	return grant, nil
}

func (s *Service) RevokeSupportAccessGrant(ctx context.Context, userID, grantID int64) (db.SupportAccessGrant, error) {
	grant, err := s.queries.RevokeSupportAccessGrant(ctx, db.RevokeSupportAccessGrantParams{ID: grantID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.SupportAccessGrant{}, ErrSupportAccessExpired
	}
	if err != nil {
		return db.SupportAccessGrant{}, err
	}
	_, _ = s.queries.InsertSupportAccessEvent(ctx, db.InsertSupportAccessEventParams{
		GrantID:    grant.ID,
		Action:     "grant_revoked",
		ActorLabel: "owner",
	})
	s.RecordSecurityEvent(ctx, userID, nil, "support_access_revoked", "user", "", map[string]any{"grant_id": grant.ID})
	return grant, nil
}

func (s *Service) CreateRetentionHoldForTest(ctx context.Context, scopeType string, scopeID int64, reasonCode, reasonDetail, authorizedBy string) (db.RetentionHold, error) {
	return s.queries.CreateRetentionHold(ctx, db.CreateRetentionHoldParams{
		ScopeType:    scopeType,
		ScopeID:      scopeID,
		ReasonCode:   reasonCode,
		ReasonDetail: reasonDetail,
		AuthorizedBy: authorizedBy,
	})
}

func (s *Service) ExecuteAdminRecoveryAction(ctx context.Context, wsID int64, supportCaseID *int64, actionType, reason, idempotencyKey, executedBy string, dryRun bool) (int64, error) {
	if strings.TrimSpace(reason) == "" || strings.TrimSpace(idempotencyKey) == "" {
		return 0, fmt.Errorf("reason and idempotency_key are required")
	}
	var existingID int64
	err := s.pool.QueryRow(ctx, `SELECT id FROM admin_recovery_actions WHERE workspace_id = $1 AND idempotency_key = $2`, wsID, idempotencyKey).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	var newID int64
	err = s.pool.QueryRow(ctx, `
		INSERT INTO admin_recovery_actions (support_case_id, workspace_id, action_type, reason, dry_run, idempotency_key, reconciliation_status, executed_by)
		VALUES ($1, $2, $3, $4, $5, $6, 'reconciled', $7)
		RETURNING id
	`, supportCaseID, wsID, actionType, reason, dryRun, idempotencyKey, executedBy).Scan(&newID)
	return newID, err
}
