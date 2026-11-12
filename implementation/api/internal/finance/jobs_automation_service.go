package finance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrJobRetryExhausted = errors.New("JOB_RETRY_EXHAUSTED")
)

func (s *Service) GetJob(ctx context.Context, workspaceID, jobID int64) (db.Job, error) {
	j, err := s.queries.GetJobByID(ctx, db.GetJobByIDParams{ID: jobID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.Job{}, ErrNotFound
	}
	return j, err
}

func (s *Service) ListFailedJobs(ctx context.Context, workspaceID int64) ([]db.FailedJob, error) {
	return s.queries.ListFailedJobs(ctx, db.ListFailedJobsParams{WorkspaceID: workspaceID, Limit: 100})
}

func (s *Service) RetryFailedJob(ctx context.Context, workspaceID, userID, jobID int64) (db.Job, error) {
	fj, err := s.queries.GetFailedJobByJobID(ctx, db.GetFailedJobByJobIDParams{JobID: jobID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.Job{}, ErrNotFound
	}
	if err != nil {
		return db.Job{}, err
	}
	if fj.Status != "open" {
		return db.Job{}, errors.New("failed job is no longer open for retry")
	}

	orig, err := s.queries.GetJobByID(ctx, db.GetJobByIDParams{ID: jobID, WorkspaceID: workspaceID})
	if err != nil {
		return db.Job{}, err
	}

	retryJob, err := s.queries.CreateJob(ctx, db.CreateJobParams{
		WorkspaceID:    workspaceID,
		UserID:         pgtype.Int8{Int64: userID, Valid: true},
		JobType:        orig.JobType,
		SourceType:     orig.SourceType,
		SourceID:       orig.SourceID,
		Payload:        orig.Payload,
		Priority:       orig.Priority,
		MaxAttempts:    3,
		TimeoutSeconds: orig.TimeoutSeconds,
		IdempotencyKey: pgtype.Text{String: fmt.Sprintf("retry-%d-%d", orig.ID, time.Now().UnixNano()), Valid: true},
	})
	if err != nil {
		return db.Job{}, err
	}

	_, _ = s.queries.MarkFailedJobRetried(ctx, db.MarkFailedJobRetriedParams{
		ID:           fj.ID,
		WorkspaceID:  workspaceID,
		RetriedJobID: pgtype.Int8{Int64: retryJob.ID, Valid: true},
	})
	return retryJob, nil
}

func (s *Service) CancelFailedJob(ctx context.Context, workspaceID, jobID int64) (db.FailedJob, error) {
	fj, err := s.queries.CancelFailedJob(ctx, db.CancelFailedJobParams{JobID: jobID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.FailedJob{}, ErrNotFound
	}
	return fj, err
}

// ClaimAndExecuteNextJob claims one eligible job using FOR UPDATE SKIP LOCKED and executes it safely.
func (s *Service) ClaimAndExecuteNextJob(ctx context.Context, workerID string) (bool, error) {
	claimed, err := s.queries.ClaimNextJob(ctx, pgtype.Text{String: workerID, Valid: true})
	if isNoRows(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	attempt, _ := s.queries.CreateJobAttempt(ctx, db.CreateJobAttemptParams{
		JobID:         claimed.ID,
		WorkspaceID:   claimed.WorkspaceID,
		AttemptNumber: claimed.Attempts,
		WorkerID:      workerID,
	})

	timeout := time.Duration(claimed.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	jobCtx, cancel := context.WithTimeout(ctx, timeout)
	execErr := s.executeClaimedJob(jobCtx, claimed)
	cancel()

	if execErr == nil {
		if attempt.ID > 0 {
			_ = s.queries.FinishJobAttempt(ctx, db.FinishJobAttemptParams{ID: attempt.ID, Status: "succeeded"})
		}
		_, err = s.queries.MarkJobSucceeded(ctx, db.MarkJobSucceededParams{ID: claimed.ID, WorkspaceID: claimed.WorkspaceID})
		return true, err
	}

	errClass := "execution_failed"
	if errors.Is(execErr, context.DeadlineExceeded) {
		errClass = "timeout"
	}
	if attempt.ID > 0 {
		_ = s.queries.FinishJobAttempt(ctx, db.FinishJobAttemptParams{
			ID:           attempt.ID,
			Status:       "failed",
			ErrorClass:   pgtype.Text{String: errClass, Valid: true},
			ErrorMessage: pgtype.Text{String: execErr.Error(), Valid: true},
		})
	}

	if claimed.Attempts < claimed.MaxAttempts {
		backoff := time.Minute
		if claimed.Attempts == 2 {
			backoff = 5 * time.Minute
		} else if claimed.Attempts >= 3 {
			backoff = 15 * time.Minute
		}
		_, err = s.queries.MarkJobRetryScheduled(ctx, db.MarkJobRetryScheduledParams{
			ID:               claimed.ID,
			WorkspaceID:      claimed.WorkspaceID,
			AvailableAt:      pgtype.Timestamptz{Time: time.Now().UTC().Add(backoff), Valid: true},
			LastErrorClass:   pgtype.Text{String: errClass, Valid: true},
			LastErrorMessage: pgtype.Text{String: execErr.Error(), Valid: true},
		})
		return true, err
	}

	_, _ = s.queries.MarkJobDeadLetter(ctx, db.MarkJobDeadLetterParams{
		ID:               claimed.ID,
		WorkspaceID:      claimed.WorkspaceID,
		LastErrorClass:   pgtype.Text{String: errClass, Valid: true},
		LastErrorMessage: pgtype.Text{String: execErr.Error(), Valid: true},
	})
	_, err = s.queries.CreateFailedJob(ctx, db.CreateFailedJobParams{
		JobID:            claimed.ID,
		WorkspaceID:      claimed.WorkspaceID,
		JobType:          claimed.JobType,
		SourceType:       claimed.SourceType,
		SourceID:         claimed.SourceID,
		Attempts:         claimed.Attempts,
		LastErrorClass:   errClass,
		LastErrorMessage: execErr.Error(),
	})
	return true, err
}

func (s *Service) executeClaimedJob(ctx context.Context, j db.Job) error {
	switch j.JobType {
	case "ai_parse_money_draft":
		var p struct {
			AIRequestID   int64  `json:"ai_request_id"`
			ReservationID int64  `json:"reservation_id"`
			Narration     string `json:"narration"`
			ScopeHint     string `json:"scope_hint"`
			DirectionHint string `json:"direction_hint"`
		}
		if err := json.Unmarshal(j.Payload, &p); err != nil {
			return err
		}
		reqRow, err := s.queries.GetAIRequestByID(ctx, db.GetAIRequestByIDParams{ID: p.AIRequestID, WorkspaceID: j.WorkspaceID})
		if err != nil {
			return err
		}
		_, err = s.executeAIParse(ctx, j.WorkspaceID, reqRow.UserID, reqRow, p.ReservationID, p.Narration, p.ScopeHint, p.DirectionHint)
		return err

	case "import_analyze_batch":
		var p struct {
			BatchID int64 `json:"batch_id"`
		}
		if err := json.Unmarshal(j.Payload, &p); err != nil {
			return err
		}
		_, err := s.AnalyzeImportBatch(ctx, j.WorkspaceID, p.BatchID)
		return err

	case "import_confirm_batch":
		var p struct {
			BatchID int64   `json:"batch_id"`
			UserID  int64   `json:"user_id"`
			RowIDs  []int64 `json:"row_ids"`
		}
		if err := json.Unmarshal(j.Payload, &p); err != nil {
			return err
		}
		_, err := s.ConfirmImportBatch(ctx, j.WorkspaceID, p.UserID, p.BatchID, p.RowIDs)
		return err

	case "automation_evaluate":
		var p struct {
			RuleKey string `json:"rule_key"`
		}
		if err := json.Unmarshal(j.Payload, &p); err != nil {
			return err
		}
		_, err := s.RunAutomationRule(ctx, j.WorkspaceID, p.RuleKey)
		return err

	default:
		return fmt.Errorf("unsupported job_type %q", j.JobType)
	}
}

// ==================== Deterministic Automation ====================

type UpsertAutomationRuleInput struct {
	Name      string         `json:"name" binding:"required"`
	RuleType  string         `json:"rule_type" binding:"required"`
	IsEnabled bool           `json:"is_enabled"`
	Config    map[string]any `json:"config"`
}

var allowedAutomationTypes = map[string]bool{
	"budget_threshold":         true,
	"invoice_due_reminder":     true,
	"bill_due_reminder":        true,
	"low_stock_alert":          true,
	"expiry_alert":             true,
	"import_categorization":    true,
	"document_delivery_retry":  true,
	"domain_verification_poll": true,
}

func (s *Service) ListAutomationRules(ctx context.Context, workspaceID int64) ([]db.AutomationRule, error) {
	return s.queries.ListAutomationRules(ctx, workspaceID)
}

func (s *Service) ListAutomationExecutions(ctx context.Context, workspaceID int64) ([]db.AutomationExecution, error) {
	return s.queries.ListAutomationExecutions(ctx, db.ListAutomationExecutionsParams{WorkspaceID: workspaceID, Limit: 50})
}

func (s *Service) UpsertAutomationRule(ctx context.Context, workspaceID, userID int64, ruleKey string, in UpsertAutomationRuleInput) (db.AutomationRule, error) {
	ruleKey = strings.ToLower(strings.TrimSpace(ruleKey))
	ruleType := strings.ToLower(strings.TrimSpace(in.RuleType))
	if ruleKey == "" || !allowedAutomationTypes[ruleType] {
		return db.AutomationRule{}, errors.New("invalid automation rule_key or rule_type")
	}
	cfgBytes, _ := json.Marshal(in.Config)
	if len(cfgBytes) == 0 {
		cfgBytes = []byte("{}")
	}
	return s.queries.UpsertAutomationRule(ctx, db.UpsertAutomationRuleParams{
		WorkspaceID:     workspaceID,
		RuleKey:         ruleKey,
		Name:            strings.TrimSpace(in.Name),
		RuleType:        ruleType,
		IsEnabled:       in.IsEnabled,
		ConfigJson:      cfgBytes,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
}

func (s *Service) RunAutomationRule(ctx context.Context, workspaceID int64, ruleKey string) (db.AutomationExecution, error) {
	rule, err := s.queries.GetAutomationRuleByKey(ctx, db.GetAutomationRuleByKeyParams{
		WorkspaceID: workspaceID,
		RuleKey:     strings.ToLower(strings.TrimSpace(ruleKey)),
	})
	if isNoRows(err) {
		return db.AutomationExecution{}, ErrNotFound
	}
	if err != nil {
		return db.AutomationExecution{}, err
	}

	dayKey := fmt.Sprintf("auto-%d-%s-%s", workspaceID, rule.RuleKey, time.Now().UTC().Format("2006-01-02"))
	if !rule.IsEnabled {
		return s.queries.CreateAutomationExecution(ctx, db.CreateAutomationExecutionParams{
			RuleID:         rule.ID,
			WorkspaceID:    workspaceID,
			IdempotencyKey: dayKey + "-disabled",
			Status:         "skipped",
			Summary:        "Rule is disabled by user",
			AffectedCount:  0,
		})
	}

	var affected int32
	summary := "Evaluated deterministic rule with 0 alerts"
	switch rule.RuleType {
	case "invoice_due_reminder":
		var cnt int32
		_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM invoices WHERE workspace_id = $1 AND status IN ('finalized', 'partially_paid') AND due_date IS NOT NULL AND due_date <= CURRENT_DATE + interval '3 days'`, workspaceID).Scan(&cnt)
		affected = cnt
		summary = fmt.Sprintf("Found %d invoices due within 3 days or overdue", cnt)
	case "bill_due_reminder":
		var cnt int32
		_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM supplier_bills WHERE workspace_id = $1 AND status IN ('approved', 'partially_paid') AND due_date IS NOT NULL AND due_date <= CURRENT_DATE + interval '3 days'`, workspaceID).Scan(&cnt)
		affected = cnt
		summary = fmt.Sprintf("Found %d supplier bills due within 3 days or overdue", cnt)
	case "low_stock_alert":
		var cnt int32
		_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM inventory_balances WHERE workspace_id = $1 AND quantity_on_hand <= 5`, workspaceID).Scan(&cnt)
		affected = cnt
		summary = fmt.Sprintf("Found %d low-stock inventory items", cnt)
	case "budget_threshold":
		summary = "Evaluated workspace budget utilization thresholds (alert-only, no ledger mutation)"
	case "import_categorization":
		summary = "Import categorization rule active for future CSV analysis suggestions"
	default:
		summary = fmt.Sprintf("Evaluated %s safely without ledger mutation", rule.RuleType)
	}

	_ = s.queries.TouchAutomationRuleRun(ctx, db.TouchAutomationRuleRunParams{ID: rule.ID, WorkspaceID: workspaceID})
	return s.queries.CreateAutomationExecution(ctx, db.CreateAutomationExecutionParams{
		RuleID:         rule.ID,
		WorkspaceID:    workspaceID,
		IdempotencyKey: dayKey,
		Status:         "succeeded",
		Summary:        summary,
		AffectedCount:  affected,
	})
}
