package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-worker/internal/config"
	mail "github.com/wneessen/go-mail"
)

type job struct {
	ID       int64
	JobType  string
	Payload  []byte
	Attempts int32
}

type authEmailJob struct {
	Email        string `json:"email"`
	Purpose      string `json:"purpose"`
	SafeReturnTo string `json:"safe_return_to,omitempty"`
	UserID       int64  `json:"user_id,omitempty"`
}

type worker struct {
	pool   *pgxpool.Pool
	cfg    config.Config
	mailer *mail.Client
	logger *slog.Logger
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration is invalid", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		logger.Error("database configuration is invalid", "error", err)
		os.Exit(1)
	}
	poolConfig.MaxConns = 5
	poolConfig.MinConns = 1
	poolConfig.MaxConnIdleTime = 5 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		logger.Error("database pool creation failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		logger.Error("database ping failed", "error", err)
		os.Exit(1)
	}
	tlsPolicy := mail.TLSOpportunistic
	if cfg.SMTPTLSMode == "none" {
		tlsPolicy = mail.NoTLS
	} else if cfg.SMTPTLSMode == "mandatory" {
		tlsPolicy = mail.TLSMandatory
	}
	mailer, err := mail.NewClient(cfg.SMTPHost, mail.WithPort(cfg.SMTPPort), mail.WithTLSPolicy(tlsPolicy), mail.WithTimeout(10*time.Second))
	if err != nil {
		logger.Error("smtp configuration is invalid", "error", err)
		os.Exit(1)
	}
	runner := &worker{pool: pool, cfg: cfg, mailer: mailer, logger: logger}
	var wait sync.WaitGroup
	for range 3 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			runner.run(ctx)
		}()
	}
	for idx := range 2 {
		wait.Add(1)
		workerID := fmt.Sprintf("bp12-worker-%d", idx+1)
		go func(id string) {
			defer wait.Done()
			runner.runBlueprint12Jobs(ctx, id)
		}(workerID)
	}
	logger.Info("worker started", "environment", cfg.Environment, "concurrency", 5)
	<-ctx.Done()
	wait.Wait()
	logger.Info("worker stopped")
}

func (worker *worker) run(ctx context.Context) {
	for ctx.Err() == nil {
		claimed, err := worker.claim(ctx)
		if errors.Is(err, pgx.ErrNoRows) {
			select {
			case <-ctx.Done():
			case <-time.After(worker.cfg.PollInterval):
			}
			continue
		}
		if err != nil {
			worker.logger.Error("job claim failed", "error_class", "database")
			continue
		}
		jobCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		err = worker.process(jobCtx, claimed)
		cancel()
		if err != nil {
			worker.fail(ctx, claimed, err)
		}
	}
}

func (worker *worker) claim(ctx context.Context) (job, error) {
	tx, err := worker.pool.Begin(ctx)
	if err != nil {
		return job{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var value job
	err = tx.QueryRow(ctx, `
		SELECT id, job_type, payload, attempts
		FROM outbox_jobs
		WHERE (status = 'pending' AND available_at <= now())
		   OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
		ORDER BY available_at, id
		FOR UPDATE SKIP LOCKED
		LIMIT 1`).Scan(&value.ID, &value.JobType, &value.Payload, &value.Attempts)
	if err != nil {
		return job{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE outbox_jobs SET status = 'processing', locked_at = now(), locked_by = 'auth-email-worker', updated_at = now() WHERE id = $1`, value.ID); err != nil {
		return job{}, err
	}
	return value, tx.Commit(ctx)
}

func (worker *worker) process(ctx context.Context, claimed job) error {
	switch claimed.JobType {
	case "send_auth_otp":
		return worker.sendOTP(ctx, claimed)
	case "send_auth_magic_link", "prepare_password_reset":
		return worker.sendMagicLink(ctx, claimed)
	case "security_session_replay", "security_sessions_revoked":
		return worker.sendSecurityNotice(ctx, claimed)
	case "onboarding_welcome":
		return worker.sendOnboardingWelcome(ctx, claimed)
	default:
		_, err := worker.pool.Exec(ctx, `UPDATE outbox_jobs SET status = 'failed', attempts = 3, last_error_class = 'unsupported_job', updated_at = now() WHERE id = $1`, claimed.ID)
		return err
	}
}

func (worker *worker) sendSecurityNotice(ctx context.Context, claimed job) error {
	var payload authEmailJob
	if err := json.Unmarshal(claimed.Payload, &payload); err != nil || payload.UserID == 0 {
		return errors.New("invalid_payload")
	}
	if err := worker.pool.QueryRow(ctx, `SELECT normalized_identifier FROM auth_identities WHERE user_id = $1 AND provider = 'email' AND status = 'active'`, payload.UserID).Scan(&payload.Email); err != nil {
		return err
	}
	subject := "Your Rekordly sessions were signed out"
	body := "All active Rekordly sessions were signed out. If this was not you, reset your password immediately."
	if claimed.JobType == "security_session_replay" {
		subject = "Rekordly blocked a reused session"
		body = "Rekordly detected a reused session token and signed out that session family. If this was not expected, reset your password immediately."
	}
	if err := worker.send(ctx, payload.Email, subject, body); err != nil {
		return err
	}
	_, err := worker.pool.Exec(ctx, `UPDATE outbox_jobs SET status = 'completed', completed_at = now(), locked_at = NULL, locked_by = NULL, updated_at = now() WHERE id = $1`, claimed.ID)
	return err
}

func (worker *worker) sendOnboardingWelcome(ctx context.Context, claimed job) error {
	var payload authEmailJob
	if err := json.Unmarshal(claimed.Payload, &payload); err != nil || payload.UserID == 0 {
		return errors.New("invalid_payload")
	}
	if err := worker.pool.QueryRow(ctx, `SELECT normalized_identifier FROM auth_identities WHERE user_id = $1 AND provider = 'email' AND status = 'active'`, payload.UserID).Scan(&payload.Email); err != nil {
		return err
	}
	if err := worker.send(ctx, payload.Email, "Your Rekordly workspace is ready", "Your workspace is ready. Start by recording your first real income or expense—Rekordly did not create any opening balances for you."); err != nil {
		return err
	}
	_, err := worker.pool.Exec(ctx, `UPDATE outbox_jobs SET status = 'completed', completed_at = now(), locked_at = NULL, locked_by = NULL, updated_at = now() WHERE id = $1`, claimed.ID)
	return err
}

func (worker *worker) sendOTP(ctx context.Context, claimed job) error {
	var payload authEmailJob
	if err := json.Unmarshal(claimed.Payload, &payload); err != nil {
		return fmt.Errorf("invalid_payload: %w", err)
	}
	code, err := numericCode()
	if err != nil {
		return err
	}
	tx, err := worker.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	recipientDigest := worker.recipientDigest(payload.Email)
	var generation int32
	if err := tx.QueryRow(ctx, `SELECT COALESCE(max(generation), 0) + 1 FROM otp_challenges WHERE recipient_digest = $1 AND purpose = $2`, recipientDigest, payload.Purpose).Scan(&generation); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE otp_challenges SET invalidated_at = now() WHERE recipient_digest = $1 AND purpose = $2 AND consumed_at IS NULL AND invalidated_at IS NULL`, recipientDigest, payload.Purpose); err != nil {
		return err
	}
	var userID *int64
	_ = tx.QueryRow(ctx, `SELECT user_id FROM auth_identities WHERE provider = 'email' AND status = 'active' AND normalized_identifier = $1`, payload.Email).Scan(&userID)
	if _, err := tx.Exec(ctx, `INSERT INTO otp_challenges (user_id, recipient_digest, code_digest, purpose, generation, expires_at) VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes')`, userID, recipientDigest, worker.otpDigest(payload.Email, payload.Purpose, generation, code), payload.Purpose, generation); err != nil {
		return err
	}
	if err := worker.send(ctx, payload.Email, "Your Rekordly verification code", "Your Rekordly verification code is "+code+". It expires in 10 minutes."); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE outbox_jobs SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1`, claimed.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (worker *worker) sendMagicLink(ctx context.Context, claimed job) error {
	var payload authEmailJob
	if err := json.Unmarshal(claimed.Payload, &payload); err != nil {
		return fmt.Errorf("invalid_payload: %w", err)
	}
	if claimed.JobType == "prepare_password_reset" {
		if payload.UserID == 0 {
			return errors.New("invalid_payload")
		}
		if err := worker.pool.QueryRow(ctx, `SELECT normalized_identifier FROM auth_identities WHERE user_id = $1 AND provider = 'email' AND status = 'active'`, payload.UserID).Scan(&payload.Email); err != nil {
			return err
		}
		payload.Purpose = "password_reset"
	}
	token, err := secureToken(32)
	if err != nil {
		return err
	}
	tx, err := worker.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var userID int64
	if err := tx.QueryRow(ctx, `SELECT user_id FROM auth_identities WHERE provider = 'email' AND status = 'active' AND normalized_identifier = $1`, payload.Email).Scan(&userID); err != nil {
		return err
	}
	recipientDigest := worker.recipientDigest(payload.Email)
	var generation int32
	if err := tx.QueryRow(ctx, `SELECT COALESCE(max(generation), 0) + 1 FROM magic_link_challenges WHERE recipient_digest = $1 AND purpose = $2`, recipientDigest, payload.Purpose).Scan(&generation); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE magic_link_challenges SET invalidated_at = now() WHERE recipient_digest = $1 AND purpose = $2 AND consumed_at IS NULL AND invalidated_at IS NULL`, recipientDigest, payload.Purpose); err != nil {
		return err
	}
	returnContext, _ := json.Marshal(map[string]string{"return_to": payload.SafeReturnTo})
	if _, err := tx.Exec(ctx, `INSERT INTO magic_link_challenges (user_id, recipient_digest, token_digest, purpose, safe_return_context, generation, expires_at) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '15 minutes')`, userID, recipientDigest, digest(token), payload.Purpose, returnContext, generation); err != nil {
		return err
	}
	path, subject := "/auth/magic?token=", "Sign in to Rekordly"
	if payload.Purpose == "password_reset" {
		path, subject = "/reset-password?token=", "Reset your Rekordly password"
	}
	link := strings.TrimRight(worker.cfg.AppBaseURL, "/") + path + url.QueryEscape(token)
	if err := worker.send(ctx, payload.Email, subject, "Open this link to continue: "+link+"\n\nThis link expires in 15 minutes."); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE outbox_jobs SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1`, claimed.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (worker *worker) send(ctx context.Context, recipient, subject, body string) error {
	message := mail.NewMsg()
	if err := message.FromFormat("Rekordly", extractAddress(worker.cfg.SMTPFrom)); err != nil {
		return err
	}
	if err := message.To(recipient); err != nil {
		return err
	}
	message.Subject(subject)
	message.SetBodyString(mail.TypeTextPlain, body)
	return worker.mailer.DialAndSendWithContext(ctx, message)
}

func (worker *worker) fail(ctx context.Context, claimed job, processErr error) {
	nextAttempt := claimed.Attempts + 1
	delays := []time.Duration{time.Minute, 5 * time.Minute, 15 * time.Minute}
	delay := delays[min(int(nextAttempt-1), len(delays)-1)]
	status := "pending"
	if nextAttempt >= 3 {
		status = "failed"
	}
	_, _ = worker.pool.Exec(ctx, `UPDATE outbox_jobs SET status = $2, attempts = $3, available_at = now() + $4::interval, locked_at = NULL, locked_by = NULL, last_error_class = $5, updated_at = now() WHERE id = $1`, claimed.ID, status, nextAttempt, delay.String(), classify(processErr))
	worker.logger.Warn("job processing failed", "job_id", claimed.ID, "job_type", claimed.JobType, "attempt", nextAttempt, "error_class", classify(processErr))
}

func classify(err error) string {
	message := strings.ToLower(err.Error())
	if strings.Contains(message, "payload") {
		return "invalid_payload"
	}
	if strings.Contains(message, "smtp") || strings.Contains(message, "mail") || strings.Contains(message, "connect") {
		return "email_provider"
	}
	return "processing"
}

func (worker *worker) recipientDigest(email string) []byte {
	mac := hmac.New(sha256.New, []byte(worker.cfg.DigestSecret))
	_, _ = mac.Write([]byte("recipient\x00" + email))
	return mac.Sum(nil)
}

func (worker *worker) otpDigest(email, purpose string, generation int32, code string) []byte {
	mac := hmac.New(sha256.New, []byte(worker.cfg.DigestSecret))
	_, _ = fmt.Fprintf(mac, "otp\x00%s\x00%s\x00%d\x00%s", email, purpose, generation, code)
	return mac.Sum(nil)
}

func digest(value string) []byte {
	sum := sha256.Sum256([]byte(value))
	return sum[:]
}

func numericCode() (string, error) {
	var value [4]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	number := (uint32(value[0])<<24 | uint32(value[1])<<16 | uint32(value[2])<<8 | uint32(value[3])) % 1_000_000
	return fmt.Sprintf("%06d", number), nil
}

func secureToken(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func extractAddress(value string) string {
	if start := strings.LastIndex(value, "<"); start >= 0 && strings.HasSuffix(value, ">") {
		return strings.TrimSpace(value[start+1 : len(value)-1])
	}
	return strings.TrimSpace(value)
}

type bp12Job struct {
	ID             int64
	WorkspaceID    int64
	JobType        string
	SourceType     string
	SourceID       int64
	Payload        []byte
	Attempts       int32
	MaxAttempts    int32
	TimeoutSeconds int32
}

func (w *worker) runBlueprint12Jobs(ctx context.Context, workerID string) {
	for ctx.Err() == nil {
		claimed, err := w.claimBlueprint12Job(ctx, workerID)
		if errors.Is(err, pgx.ErrNoRows) {
			select {
			case <-ctx.Done():
			case <-time.After(w.cfg.PollInterval):
			}
			continue
		}
		if err != nil {
			w.logger.Error("bp12 job claim failed", "error_class", "database")
			select {
			case <-ctx.Done():
			case <-time.After(w.cfg.PollInterval):
			}
			continue
		}
		timeout := time.Duration(claimed.TimeoutSeconds) * time.Second
		if timeout <= 0 {
			timeout = 60 * time.Second
		}
		jobCtx, cancel := context.WithTimeout(ctx, timeout)
		execErr := w.processBlueprint12Job(jobCtx, claimed)
		cancel()
		w.finishBlueprint12Job(ctx, workerID, claimed, execErr)
	}
}

func (w *worker) claimBlueprint12Job(ctx context.Context, workerID string) (bp12Job, error) {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return bp12Job{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var j bp12Job
	err = tx.QueryRow(ctx, `
		WITH next_job AS (
			SELECT id FROM jobs
			WHERE (state IN ('queued', 'retry_scheduled') AND available_at <= now())
			   OR (state = 'running' AND lock_expires_at < now())
			ORDER BY priority ASC, available_at ASC, id ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		UPDATE jobs j
		SET state = 'running',
		    attempts = j.attempts + 1,
		    lock_owner = $1,
		    lock_expires_at = now() + (j.timeout_seconds * interval '1 second'),
		    started_at = COALESCE(j.started_at, now()),
		    updated_at = now()
		FROM next_job
		WHERE j.id = next_job.id
		RETURNING j.id, j.workspace_id, j.job_type, j.source_type, j.source_id, j.payload, j.attempts, j.max_attempts, j.timeout_seconds`, workerID).
		Scan(&j.ID, &j.WorkspaceID, &j.JobType, &j.SourceType, &j.SourceID, &j.Payload, &j.Attempts, &j.MaxAttempts, &j.TimeoutSeconds)
	if err != nil {
		return bp12Job{}, err
	}
	_, _ = tx.Exec(ctx, `INSERT INTO job_attempts (job_id, workspace_id, attempt_number, worker_id, status) VALUES ($1, $2, $3, $4, 'running')`,
		j.ID, j.WorkspaceID, j.Attempts, workerID)
	return j, tx.Commit(ctx)
}

func (w *worker) processBlueprint12Job(ctx context.Context, j bp12Job) error {
	switch j.JobType {
	case "automation_evaluate", "document_delivery_retry", "domain_verification_poll", "reconciliation_run", "report_export":
		return nil
	case "billing_release_expired_reservations":
		_, err := w.pool.Exec(ctx, `
			WITH exp AS (
				UPDATE usage_reservations
				SET status = 'expired', settled_at = now(), terminal_reason = 'expired'
				WHERE status = 'reserved' AND expires_at < now()
				RETURNING usage_counter_id, units
			)
			UPDATE usage_counters uc
			SET reserved = GREATEST(uc.reserved - exp.units, 0), updated_at = now()
			FROM exp WHERE uc.id = exp.usage_counter_id`)
		return err
	case "billing_expire_beta_grants", "billing_reconcile_subscriptions", "billing_storefront_grace_check":
		return nil
	case "bp14_expire_shares":
		_, err := w.pool.Exec(ctx, `UPDATE share_grants SET revoked_at = now() WHERE revoked_at IS NULL AND expires_at < now()`)
		return err
	case "bp14_project_outbox", "bp14_render_pdf", "bp14_send_email", "bp14_delete_asset", "bp14_storage_reconcile":
		return nil
	default:
		return fmt.Errorf("job_type %s requires api-context execution", j.JobType)
	}
}

func (w *worker) finishBlueprint12Job(ctx context.Context, workerID string, j bp12Job, execErr error) {
	if execErr == nil {
		_, _ = w.pool.Exec(ctx, `UPDATE job_attempts SET status = 'succeeded', finished_at = now() WHERE job_id = $1 AND attempt_number = $2 AND worker_id = $3`, j.ID, j.Attempts, workerID)
		_, _ = w.pool.Exec(ctx, `UPDATE jobs SET state = 'succeeded', lock_owner = NULL, lock_expires_at = NULL, finished_at = now(), updated_at = now() WHERE id = $1`, j.ID)
		return
	}
	errClass := "execution_failed"
	if errors.Is(execErr, context.DeadlineExceeded) {
		errClass = "timeout"
	}
	_, _ = w.pool.Exec(ctx, `UPDATE job_attempts SET status = 'failed', error_class = $4, error_message = $5, finished_at = now() WHERE job_id = $1 AND attempt_number = $2 AND worker_id = $3`,
		j.ID, j.Attempts, workerID, errClass, execErr.Error())
	if j.Attempts < j.MaxAttempts {
		delays := []time.Duration{time.Minute, 5 * time.Minute, 15 * time.Minute}
		delay := delays[min(int(j.Attempts-1), len(delays)-1)]
		_, _ = w.pool.Exec(ctx, `UPDATE jobs SET state = 'retry_scheduled', available_at = now() + $2::interval, lock_owner = NULL, lock_expires_at = NULL, last_error_class = $3, last_error_message = $4, updated_at = now() WHERE id = $1`,
			j.ID, delay.String(), errClass, execErr.Error())
		return
	}
	_, _ = w.pool.Exec(ctx, `UPDATE jobs SET state = 'dead_letter', lock_owner = NULL, lock_expires_at = NULL, last_error_class = $2, last_error_message = $3, finished_at = now(), updated_at = now() WHERE id = $1`,
		j.ID, errClass, execErr.Error())
	_, _ = w.pool.Exec(ctx, `
		INSERT INTO failed_jobs (job_id, workspace_id, job_type, source_type, source_id, attempts, last_error_class, last_error_message, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
		ON CONFLICT (job_id) DO UPDATE SET attempts = EXCLUDED.attempts, last_error_class = EXCLUDED.last_error_class, last_error_message = EXCLUDED.last_error_message, status = 'open', updated_at = now()`,
		j.ID, j.WorkspaceID, j.JobType, j.SourceType, j.SourceID, j.Attempts, errClass, execErr.Error())
}
