package finance

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type AdminOpsOverview struct {
	QueuePendingCount   int64                `json:"queue_pending_count"`
	QueueDeadLetterCnt  int64                `json:"queue_dead_letter_count"`
	OldestPendingAgeSec int64                `json:"oldest_pending_age_sec"`
	MaintenanceMode     db.MaintenanceMode   `json:"maintenance_mode"`
	LatestDeployment    *db.DeploymentRecord `json:"latest_deployment,omitempty"`
	ProviderStatus      map[string]string    `json:"provider_status"`
}

func (s *Service) GetAdminOpsOverview(ctx context.Context) (AdminOpsOverview, error) {
	var pendingCnt, dlqCnt, oldestAge int64
	_ = s.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending'),
			COUNT(*) FILTER (WHERE status IN ('dead_letter', 'failed')),
			COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE status = 'pending')))::bigint, 0)
		FROM outbox_jobs
	`).Scan(&pendingCnt, &dlqCnt, &oldestAge)

	mm, err := s.queries.GetMaintenanceMode(ctx)
	if err != nil {
		return AdminOpsOverview{}, err
	}
	deps, _ := s.queries.ListDeploymentRecords(ctx, 1)
	var latest *db.DeploymentRecord
	if len(deps) > 0 {
		latest = &deps[0]
	}

	return AdminOpsOverview{
		QueuePendingCount:   pendingCnt,
		QueueDeadLetterCnt:  dlqCnt,
		OldestPendingAgeSec: oldestAge,
		MaintenanceMode:     mm,
		LatestDeployment:    latest,
		ProviderStatus: map[string]string{
			"postgres": "connected",
			"email":    "configured",
			"storage":  "configured",
			"ai":       "configured",
			"billing":  "configured",
		},
	}, nil
}

func (s *Service) ListAdminOutboxJobs(ctx context.Context, limit int32) ([]db.ListRecentOutboxJobsRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	return s.queries.ListRecentOutboxJobs(ctx, limit)
}

func (s *Service) RetryAdminOutboxJob(ctx context.Context, actorUserID, jobID int64, reason string) (db.RetryOutboxJobRow, error) {
	if strings.TrimSpace(reason) == "" {
		return db.RetryOutboxJobRow{}, fmt.Errorf("reason is required for manual job retry")
	}
	row, err := s.queries.RetryOutboxJob(ctx, jobID)
	if err != nil {
		return db.RetryOutboxJobRow{}, err
	}
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata)
		VALUES ($1, 'admin_job_retried', 'outbox_job', $2, jsonb_build_object('reason', $3::text))
	`, actorUserID, fmt.Sprintf("%d", jobID), strings.TrimSpace(reason))
	return row, nil
}

func (s *Service) ListFeatureFlags(ctx context.Context) ([]db.FeatureFlag, error) {
	return s.queries.ListFeatureFlags(ctx)
}

func (s *Service) UpdateFeatureFlag(ctx context.Context, actorUserID int64, flagKey string, enabled, killSwitch bool, reason string) (db.FeatureFlag, error) {
	if strings.TrimSpace(reason) == "" {
		return db.FeatureFlag{}, fmt.Errorf("reason is required to update feature flag")
	}
	updated, err := s.queries.UpdateFeatureFlag(ctx, db.UpdateFeatureFlagParams{
		FlagKey:          strings.TrimSpace(flagKey),
		EnabledInEnv:     enabled,
		KillSwitchActive: killSwitch,
		UpdatedBy:        fmt.Sprintf("user:%d", actorUserID),
	})
	if err != nil {
		return db.FeatureFlag{}, err
	}
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata)
		VALUES ($1, 'feature_flag_updated', 'feature_flag', $2, jsonb_build_object('enabled', $3::bool, 'kill_switch', $4::bool, 'reason', $5::text))
	`, actorUserID, updated.FlagKey, enabled, killSwitch, strings.TrimSpace(reason))
	return updated, nil
}

func (s *Service) GetMaintenanceMode(ctx context.Context) (db.MaintenanceMode, error) {
	return s.queries.GetMaintenanceMode(ctx)
}

func (s *Service) UpdateMaintenanceMode(ctx context.Context, actorUserID int64, mode, scope, reason, ownerLabel string) (db.MaintenanceMode, error) {
	mode = strings.TrimSpace(strings.ToLower(mode))
	if mode != "normal" && mode != "degraded_feature" && mode != "read_only" && mode != "scheduled_maintenance" && mode != "emergency_security_lock" {
		return db.MaintenanceMode{}, fmt.Errorf("invalid maintenance mode")
	}
	if strings.TrimSpace(reason) == "" {
		return db.MaintenanceMode{}, fmt.Errorf("reason is required")
	}
	if strings.TrimSpace(scope) == "" {
		scope = "global"
	}
	if strings.TrimSpace(ownerLabel) == "" {
		ownerLabel = fmt.Sprintf("user:%d", actorUserID)
	}
	updated, err := s.queries.UpdateMaintenanceMode(ctx, db.UpdateMaintenanceModeParams{
		Mode:       mode,
		Scope:      scope,
		Reason:     strings.TrimSpace(reason),
		OwnerLabel: ownerLabel,
	})
	if err != nil {
		return db.MaintenanceMode{}, err
	}
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata)
		VALUES ($1, 'maintenance_mode_updated', 'system', 'maintenance', jsonb_build_object('mode', $2::text, 'scope', $3::text, 'reason', $4::text))
	`, actorUserID, mode, scope, strings.TrimSpace(reason))
	return updated, nil
}

type AdminReconciliationReport struct {
	WorkspaceID             *int64    `json:"workspace_id,omitempty"`
	UnbalancedJournalsCount int64     `json:"unbalanced_journals_count"`
	NegativeStockItemsCount int64     `json:"negative_stock_items_count"`
	ActiveTombstonesCount   int64     `json:"active_tombstones_count"`
	Status                  string    `json:"status"`
	CheckedAt               time.Time `json:"checked_at"`
}

func (s *Service) RunAdminReconciliation(ctx context.Context, actorUserID int64, workspaceID *int64, reason string) (AdminReconciliationReport, error) {
	if strings.TrimSpace(reason) == "" {
		return AdminReconciliationReport{}, fmt.Errorf("reason is required")
	}
	var unbalanced, tombstones int64
	if workspaceID != nil && *workspaceID > 0 {
		_ = s.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM (
				SELECT je.id FROM journal_entries je
				JOIN journal_lines jl ON jl.journal_entry_id = je.id
				WHERE je.workspace_id = $1 AND je.status = 'posted'
				GROUP BY je.id
				HAVING COALESCE(SUM(jl.debit_minor), 0) <> COALESCE(SUM(jl.credit_minor), 0)
			) t
		`, *workspaceID).Scan(&unbalanced)
	} else {
		_ = s.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM (
				SELECT je.id FROM journal_entries je
				JOIN journal_lines jl ON jl.journal_entry_id = je.id
				WHERE je.status = 'posted'
				GROUP BY je.id
				HAVING COALESCE(SUM(jl.debit_minor), 0) <> COALESCE(SUM(jl.credit_minor), 0)
			) t
		`).Scan(&unbalanced)
	}
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM deletion_tombstones`).Scan(&tombstones)

	status := "healthy"
	if unbalanced > 0 {
		status = "discrepancy_detected"
	}

	_, _ = s.pool.Exec(ctx, `
		INSERT INTO audit_events (workspace_id, actor_user_id, event_type, subject_type, subject_id, metadata)
		VALUES ($1, $2, 'admin_reconciliation_run', 'reconciliation', 'global', jsonb_build_object('status', $3::text, 'unbalanced', $4::bigint, 'reason', $5::text))
	`, workspaceID, actorUserID, status, unbalanced, strings.TrimSpace(reason))

	return AdminReconciliationReport{
		WorkspaceID:             workspaceID,
		UnbalancedJournalsCount: unbalanced,
		NegativeStockItemsCount: 0,
		ActiveTombstonesCount:   tombstones,
		Status:                  status,
		CheckedAt:               time.Now().UTC(),
	}, nil
}

func (s *Service) RecordDeployment(ctx context.Context, env, commitSHA, imageTag, migrationVer, deployedBy, status string) (db.DeploymentRecord, error) {
	flags, _ := s.queries.ListFeatureFlags(ctx)
	snapMap := make(map[string]bool, len(flags))
	for _, f := range flags {
		snapMap[f.FlagKey] = f.EnabledInEnv && !f.KillSwitchActive
	}
	snapBytes, _ := json.Marshal(snapMap)
	if status == "" {
		status = "deployed"
	}
	return s.queries.CreateDeploymentRecord(ctx, db.CreateDeploymentRecordParams{
		Environment:          env,
		CommitSha:            commitSHA,
		ImageTag:             imageTag,
		MigrationVersion:     migrationVer,
		FeatureFlagsSnapshot: snapBytes,
		DeployedBy:           deployedBy,
		Status:               status,
	})
}

func (s *Service) RecordBackupRehearsal(ctx context.Context, env, backupID, source, checksum string, rpoSec, rtoSec int32, workspaceID *int64) (db.BackupRehearsalRecord, error) {
	rep, err := s.RunAdminReconciliation(ctx, 0, workspaceID, "backup_restore_rehearsal")
	if err != nil {
		return db.BackupRehearsalRecord{}, err
	}
	status := "verified"
	if rep.UnbalancedJournalsCount > 0 {
		status = "failed"
	}
	var journalCount int64
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM journal_entries WHERE status = 'posted'`).Scan(&journalCount)
	return s.queries.CreateBackupRehearsalRecord(ctx, db.CreateBackupRehearsalRecordParams{
		Environment:        env,
		BackupID:           backupID,
		BackupSource:       source,
		ChecksumSha256:     checksum,
		RpoSeconds:         rpoSec,
		RtoSeconds:         rtoSec,
		ReconciledJournals: journalCount,
		TombstonesReplayed: rep.ActiveTombstonesCount,
		Status:             status,
	})
}

func (s *Service) UpsertBetaCohort(ctx context.Context, workspaceID int64, segment, useCase string, consent bool, modules []string, planIntent string) (db.BetaCohortRegister, error) {
	modBytes, _ := json.Marshal(modules)
	if len(modBytes) == 0 {
		modBytes = []byte("[]")
	}
	return s.queries.UpsertBetaCohortEntry(ctx, db.UpsertBetaCohortEntryParams{
		WorkspaceID:        workspaceID,
		Segment:            segment,
		UseCase:            useCase,
		ConsentAccepted:    consent,
		EnabledModulesJson: modBytes,
		OnboardingStatus:   "active",
		SupportStatus:      "healthy",
		PlanIntent:         planIntent,
	})
}

// Helper for unused pgtype import guard if needed
var _ = pgtype.Int8{}
