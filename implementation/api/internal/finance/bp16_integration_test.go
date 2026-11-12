package finance_test

import (
	"context"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestBlueprint16_ProfileContactsRecentAuthAndSecurity(t *testing.T) {
	pool, _, _, ownerID, _ := createBlueprint13Env(t, "bp16-auth")
	ctx := context.Background()
	svc := finance.NewService(pool)

	// 1. Profile optimistic concurrency.
	p1, err := svc.GetMeProfile(ctx, ownerID)
	require.NoError(t, err)
	require.Equal(t, int64(1), p1.Version)

	newName := "Ada Lovelace"
	p2, err := svc.UpdateMeProfile(ctx, ownerID, finance.UpdateProfileInput{
		ExpectedVersion: 1,
		DisplayName:     &newName,
	})
	require.NoError(t, err)
	require.Equal(t, int64(2), p2.Version)
	require.Equal(t, "Ada Lovelace", p2.DisplayName)

	// Stale version fails with SETTINGS_VERSION_CONFLICT.
	staleName := "Stale"
	_, err = svc.UpdateMeProfile(ctx, ownerID, finance.UpdateProfileInput{
		ExpectedVersion: 1,
		DisplayName:     &staleName,
	})
	require.ErrorIs(t, err, finance.ErrSettingsVersionConflict)

	// 2. Contact method requires recent auth.
	_, err = svc.AddContactMethod(ctx, ownerID, finance.AddContactMethodInput{
		MethodType: "email",
		Value:      "ada@example.com",
		IsLogin:    true,
		IsRecovery: true,
	})
	require.ErrorIs(t, err, finance.ErrRecentAuthRequired)

	_, err = svc.GrantRecentAuth(ctx, ownerID, nil, "manage_contacts", "otp", 10*time.Minute)
	require.NoError(t, err)

	added, err := svc.AddContactMethod(ctx, ownerID, finance.AddContactMethodInput{
		MethodType: "email",
		Value:      "ada@example.com",
		IsLogin:    true,
		IsRecovery: true,
	})
	require.NoError(t, err)
	require.False(t, added.ContactMethod.VerifiedAt.Valid)
	require.NotEmpty(t, added.DebugOTP)

	// Wrong OTP fails and leaves contact unverified.
	_, err = svc.VerifyContactMethod(ctx, ownerID, added.ContactMethod.ID, "000000")
	require.ErrorIs(t, err, finance.ErrContactVerificationRequired)

	// Correct OTP verifies contact.
	verified, err := svc.VerifyContactMethod(ctx, ownerID, added.ContactMethod.ID, added.DebugOTP)
	require.NoError(t, err)
	require.True(t, verified.VerifiedAt.Valid)

	primary, err := svc.MakePrimaryContactMethod(ctx, ownerID, verified.ID)
	require.NoError(t, err)
	require.True(t, primary.IsPrimary)

	// Cannot remove last login/recovery method.
	_, err = svc.RemoveContactMethod(ctx, ownerID, primary.ID)
	require.ErrorIs(t, err, finance.ErrLastLoginMethod)

	events, err := svc.ListSecurityEvents(ctx, ownerID, 20)
	require.NoError(t, err)
	require.NotEmpty(t, events)
}

func TestBlueprint16_SettingsLocksOwnershipTransferAndExport(t *testing.T) {
	pool, personalWS, businessWS, ownerID, staffID := createBlueprint13Env(t, "bp16-biz")
	ctx := context.Background()
	svc := finance.NewService(pool)

	persCtx := finance.WorkspaceContext{UserID: ownerID, WorkspaceID: personalWS, Kind: "personal", IsOwner: true, RoleCode: "owner"}
	bizCtx := finance.WorkspaceContext{UserID: ownerID, WorkspaceID: businessWS, Kind: "business", IsOwner: true, RoleCode: "owner", Permissions: []string{"settings.manage"}}

	// Cross-scope rejection.
	_, err := svc.GetScopedWorkspaceSettings(ctx, persCtx, "business")
	require.ErrorIs(t, err, finance.ErrNotFound)

	// Versioned business settings update.
	s1, err := svc.GetScopedWorkspaceSettings(ctx, bizCtx, "business")
	require.NoError(t, err)
	s2, err := svc.UpdateScopedWorkspaceSettings(ctx, bizCtx, "business", "profile", finance.UpdateScopedSettingsInput{
		ExpectedVersion: s1.Version,
		Changes:         map[string]any{"invoice_footer": "Thank you for your business"},
	})
	require.NoError(t, err)
	require.Equal(t, s1.Version+1, s2.Version)

	// Stale version conflict.
	_, err = svc.UpdateScopedWorkspaceSettings(ctx, bizCtx, "business", "profile", finance.UpdateScopedSettingsInput{
		ExpectedVersion: s1.Version,
		Changes:         map[string]any{"invoice_footer": "Overwrite"},
	})
	require.ErrorIs(t, err, finance.ErrSettingsVersionConflict)

	// Sole owner cannot suspend or remove self.
	require.ErrorIs(t, svc.SuspendBusinessMember(ctx, bizCtx, ownerID), finance.ErrLastOwnerRequired)
	require.ErrorIs(t, svc.RemoveBusinessMember(ctx, bizCtx, ownerID), finance.ErrLastOwnerRequired)

	// Add staff as active member and transfer Business ownership.
	var roleID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM roles ORDER BY id ASC LIMIT 1`).Scan(&roleID))
	_, err = pool.Exec(ctx, `
		INSERT INTO memberships (workspace_id, user_id, role_id, status)
		VALUES ($1, $2, $3, 'active')
	`, businessWS, staffID, roleID)
	require.NoError(t, err)

	_, err = svc.GrantRecentAuth(ctx, ownerID, nil, "ownership_transfer", "otp", 10*time.Minute)
	require.NoError(t, err)
	tr, err := svc.InitiateBusinessOwnershipTransfer(ctx, bizCtx, staffID)
	require.NoError(t, err)

	_, err = svc.GrantRecentAuth(ctx, staffID, nil, "ownership_transfer", "otp", 10*time.Minute)
	require.NoError(t, err)
	accepted, err := svc.AcceptBusinessOwnershipTransfer(ctx, staffID, tr.ID)
	require.NoError(t, err)
	require.Equal(t, "accepted", accepted.Status)

	// Verify Business owner changed, while Personal workspace owner remains ownerID.
	var newBizOwner, persOwner int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT owner_user_id FROM workspaces WHERE id = $1`, businessWS).Scan(&newBizOwner))
	require.NoError(t, pool.QueryRow(ctx, `SELECT owner_user_id FROM workspaces WHERE id = $1`, personalWS).Scan(&persOwner))
	require.Equal(t, staffID, newBizOwner)
	require.Equal(t, ownerID, persOwner)

	// Ownership export requires recent auth and neutralizes formula injection.
	require.Equal(t, "'=CMD()", finance.SanitizeCSVCell("=CMD()"))
	_, err = svc.CreateOwnershipExport(ctx, ownerID, finance.CreateExportInput{Scope: "account"})
	require.ErrorIs(t, err, finance.ErrRecentAuthRequired)

	_, err = svc.GrantRecentAuth(ctx, ownerID, nil, "complete_export", "otp", 10*time.Minute)
	require.NoError(t, err)
	exp, err := svc.CreateOwnershipExport(ctx, ownerID, finance.CreateExportInput{Scope: "account"})
	require.NoError(t, err)
	require.Equal(t, "ready", exp.Status)
	require.Equal(t, "balanced", exp.ReconciliationStatus)
	require.NotEmpty(t, exp.ChecksumSha256)
}

func TestBlueprint16_DeletionGraceRestorePurgeAndSupport(t *testing.T) {
	pool, personalWS, businessWS, ownerID, _ := createBlueprint13Env(t, "bp16-del")
	ctx := context.Background()
	svc := finance.NewService(pool)

	// Account deletion blocked while owning a Business workspace.
	prevAcct, err := svc.PreviewDeletion(ctx, ownerID, "account", nil)
	require.NoError(t, err)
	require.False(t, prevAcct.Eligible)

	// Personal workspace deletion is eligible.
	_, err = svc.GrantRecentAuth(ctx, ownerID, nil, "deletion_request", "otp", 10*time.Minute)
	require.NoError(t, err)
	dc, err := svc.RequestDeletion(ctx, ownerID, finance.RequestDeletionInput{
		Scope:       "personal_workspace",
		WorkspaceID: &personalWS,
		Reason:      "Testing 60-day grace",
		ConfirmText: "DELETE",
	})
	require.NoError(t, err)
	require.Equal(t, "grace_restricted", dc.Status)
	require.WithinDuration(t, time.Now().UTC().Add(60*24*time.Hour), dc.GraceDeadlineAt.Time, 2*time.Minute)

	// Cancel before purge restores idempotently.
	_, err = svc.GrantRecentAuth(ctx, ownerID, nil, "deletion_cancel", "otp", 10*time.Minute)
	require.NoError(t, err)
	restored, err := svc.CancelDeletionCase(ctx, ownerID, dc.ID)
	require.NoError(t, err)
	require.Equal(t, "restored", restored.Status)

	// Create a second case with expired grace and retention hold, then partial processor failure, then complete purge.
	dc2, err := svc.RequestDeletion(ctx, ownerID, finance.RequestDeletionInput{
		Scope:       "personal_workspace",
		WorkspaceID: &personalWS,
		Reason:      "Expired grace purge test",
		ConfirmText: "DELETE",
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE deletion_cases SET grace_deadline_at = now() - INTERVAL '1 hour' WHERE id = $1`, dc2.ID)
	require.NoError(t, err)

	// Retention hold blocks purge.
	hold, err := svc.CreateRetentionHoldForTest(ctx, "workspace", personalWS, "TAX_AUDIT", "Active audit", "legal-team")
	require.NoError(t, err)
	_, err = svc.ExecuteDeletionPurge(ctx, dc2.ID, "")
	require.ErrorIs(t, err, finance.ErrRetentionHoldActive)

	// Release hold, simulate partial processor failure -> purge_failed (retryable), then retry -> deleted.
	_, err = pool.Exec(ctx, `UPDATE retention_holds SET released_at = now() WHERE id = $1`, hold.ID)
	require.NoError(t, err)

	failedPurge, err := svc.ExecuteDeletionPurge(ctx, dc2.ID, "cloudinary")
	require.NoError(t, err)
	require.Equal(t, "purge_failed", failedPurge.Status)

	completedPurge, err := svc.ExecuteDeletionPurge(ctx, dc2.ID, "")
	require.NoError(t, err)
	require.Equal(t, "deleted", completedPurge.Status)

	// Support intake + scoped access grant + revoke + admin recovery.
	sc, err := svc.CreateSupportCase(ctx, ownerID, finance.CreateSupportCaseInput{
		WorkspaceID:       &businessWS,
		Category:          "posting_issue",
		Severity:          "SEV-2",
		Summary:           "Need diagnostic check on invoice",
		AffectedModule:    "invoices",
		ReferenceID:       "ERR-101",
		DiagnosticConsent: true,
	})
	require.NoError(t, err)
	grant, err := svc.CreateSupportAccessGrant(ctx, ownerID, finance.CreateSupportAccessGrantInput{
		SupportCaseID: sc.ID,
		WorkspaceID:   businessWS,
		ActorLabel:    "support-eng-1",
		Scope:         "read_only_diagnostics",
		Reason:        "Inspect invoice reference",
		TTLMinutes:    30,
	})
	require.NoError(t, err)
	revoked, err := svc.RevokeSupportAccessGrant(ctx, ownerID, grant.ID)
	require.NoError(t, err)
	require.True(t, revoked.RevokedAt.Valid)

	recID1, err := svc.ExecuteAdminRecoveryAction(ctx, businessWS, &sc.ID, "reconcile_projection", "Case #1", "rec-key-1", "ops-1", true)
	require.NoError(t, err)
	recID2, err := svc.ExecuteAdminRecoveryAction(ctx, businessWS, &sc.ID, "reconcile_projection", "Case #1", "rec-key-1", "ops-1", true)
	require.NoError(t, err)
	require.Equal(t, recID1, recID2)
}
