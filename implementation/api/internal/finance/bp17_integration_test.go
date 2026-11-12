package finance_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/rekordly/rekordly-api/internal/server"
	"github.com/stretchr/testify/require"
)

func TestBlueprint17_AdminOpsFlagsMaintenanceReconcileAndBackup(t *testing.T) {
	pool, _, businessWS, ownerID, _ := createBlueprint13Env(t, "bp17-ops")
	ctx := context.Background()
	svc := finance.NewService(pool)

	// 1. Secret redaction check.
	require.Equal(t, "[REDACTED]", server.RedactSensitiveValue("Bearer secret-jwt"))
	require.Equal(t, "[REDACTED]", server.RedactSensitiveValue("/auth/magic?token=abc123"))
	require.Equal(t, "/api/v1/workspaces/:id/ledger", server.RedactSensitiveValue("/api/v1/workspaces/:id/ledger"))

	// 2. Feature flags & kill switch.
	flags, err := svc.ListFeatureFlags(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, flags)

	updatedFlag, err := svc.UpdateFeatureFlag(ctx, ownerID, "ai.capture.enabled", true, true, "incident kill switch drill")
	require.NoError(t, err)
	require.True(t, updatedFlag.KillSwitchActive)

	t.Cleanup(func() {
		_, _ = svc.UpdateFeatureFlag(ctx, ownerID, "ai.capture.enabled", true, false, "restore after test")
		_, _ = svc.UpdateMaintenanceMode(ctx, ownerID, "normal", "global", "restore after test", "test")
	})

	// 3. Maintenance mode transitions.
	mm, err := svc.UpdateMaintenanceMode(ctx, ownerID, "read_only", "global", "reconciliation drill", "ops-lead")
	require.NoError(t, err)
	require.Equal(t, "read_only", mm.Mode)

	// 4. Outbox job inspection & audited manual retry.
	var jobID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO outbox_jobs (job_type, aggregate_type, aggregate_id, status, last_error_class)
		VALUES ('bp17_test_job', 'workspace', $1, 'failed', 'TIMEOUT')
		RETURNING id
	`, fmt.Sprintf("%d", businessWS)).Scan(&jobID))
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM outbox_jobs WHERE id = $1`, jobID)
	})

	retried, err := svc.RetryAdminOutboxJob(ctx, ownerID, jobID, "transient provider timeout")
	require.NoError(t, err)
	require.Equal(t, "pending", retried.Status)

	// 5. Financial reconciliation & backup rehearsal + deployment record + beta cohort.
	rep, err := svc.RunAdminReconciliation(ctx, ownerID, &businessWS, "scheduled check")
	require.NoError(t, err)
	require.Equal(t, "healthy", rep.Status)
	require.Equal(t, int64(0), rep.UnbalancedJournalsCount)

	rehearsal, err := svc.RecordBackupRehearsal(ctx, "staging", fmt.Sprintf("bkp-%d", time.Now().UnixNano()), "pg_dump_logical", "sha256:deadbeef", 60, 180, &businessWS)
	require.NoError(t, err)
	require.Equal(t, "verified", rehearsal.Status)

	dep, err := svc.RecordDeployment(ctx, "staging", "abc1234", "rekordly-api:abc1234", "000056", "ci", "deployed")
	require.NoError(t, err)
	require.Equal(t, "deployed", dep.Status)

	cohort, err := svc.UpsertBetaCohort(ctx, businessWS, "retail_sme", "inventory_and_invoicing", true, []string{"sales", "inventory"}, "business_monthly")
	require.NoError(t, err)
	require.True(t, cohort.ConsentAccepted)

	overview, err := svc.GetAdminOpsOverview(ctx)
	require.NoError(t, err)
	require.Equal(t, "read_only", overview.MaintenanceMode.Mode)
}
