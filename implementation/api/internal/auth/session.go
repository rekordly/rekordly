package auth

import (
	"context"
	"crypto/subtle"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

const concurrentRefreshGrace = 10 * time.Second

type SessionSummary struct {
	ID               int64     `json:"id"`
	DeviceLabel      string    `json:"device_label,omitempty"`
	UserAgentSummary string    `json:"user_agent_summary,omitempty"`
	IssuedAt         time.Time `json:"issued_at"`
	ExpiresAt        time.Time `json:"expires_at"`
	LastSeenAt       time.Time `json:"last_seen_at"`
	Current          bool      `json:"current"`
}

func (service *Service) authenticateFullSession(ctx context.Context, queries *db.Queries, rawSession string) (db.Session, error) {
	if rawSession == "" {
		return db.Session{}, ErrInvalidProof
	}
	session, err := queries.GetActiveFullSessionByDigest(ctx, digest(rawSession))
	if err != nil {
		return db.Session{}, ErrInvalidProof
	}
	_, _ = queries.TouchSessionIfStale(ctx, session.ID)
	return session, nil
}

func verifyCSRF(session db.Session, csrfToken string) error {
	if csrfToken == "" || subtle.ConstantTimeCompare(session.CsrfDigest, digest(csrfToken)) != 1 {
		return ErrInvalidProof
	}
	return nil
}

func (service *Service) RefreshSession(ctx context.Context, rawSession, csrfToken, device, userAgent, ipPrefix string) (SessionProof, error) {
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SessionProof{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	current, err := queries.GetSessionByRefreshDigestForUpdate(ctx, digest(rawSession))
	if err != nil || current.SessionKind != "full" || current.ExpiresAt.Time.Before(time.Now()) {
		return SessionProof{}, ErrInvalidProof
	}
	if err := verifyCSRF(current, csrfToken); err != nil {
		return SessionProof{}, err
	}
	if current.RotatedAt.Valid || (current.RevokedAt.Valid && current.RevocationReason.String == "rotated") {
		if current.RotatedAt.Valid && time.Since(current.RotatedAt.Time) <= concurrentRefreshGrace {
			return SessionProof{}, ErrRefreshInProgress
		}
		_, _ = queries.RevokeSessionFamily(ctx, db.RevokeSessionFamilyParams{FamilyID: current.FamilyID, RevocationReason: pgtype.Text{String: "refresh_replay", Valid: true}})
		_, _ = tx.Exec(ctx, `INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1, 'session_refresh_replay', 'user', $1::bigint::text, '{}'::jsonb)`, current.UserID)
		_, _ = tx.Exec(ctx, `INSERT INTO outbox_jobs (job_type, aggregate_type, aggregate_id, payload) VALUES ('security_session_replay', 'user', $1::bigint::text, jsonb_build_object('user_id', $1::bigint))`, current.UserID)
		if commitErr := tx.Commit(ctx); commitErr != nil {
			return SessionProof{}, commitErr
		}
		return SessionProof{}, ErrSessionReplayed
	}
	if current.RevokedAt.Valid {
		return SessionProof{}, ErrInvalidProof
	}
	user, err := queries.GetUserByID(ctx, current.UserID)
	if err != nil || user.Status != "active" {
		return SessionProof{}, ErrInvalidProof
	}
	proof, replacementID, err := service.createSessionInFamily(ctx, queries, current, user.OnboardingStatus, device, userAgent, ipPrefix)
	if err != nil {
		return SessionProof{}, err
	}
	updated, err := queries.CompleteSessionRotation(ctx, db.CompleteSessionRotationParams{ID: current.ID, ReplacedBySessionID: pgtype.Int8{Int64: replacementID, Valid: true}})
	if err != nil || updated != 1 {
		return SessionProof{}, ErrRefreshInProgress
	}
	if err := tx.Commit(ctx); err != nil {
		return SessionProof{}, err
	}
	return proof, nil
}

func (service *Service) createSessionInFamily(ctx context.Context, queries *db.Queries, previous db.Session, onboarding, device, userAgent, ipPrefix string) (SessionProof, int64, error) {
	token, err := randomToken(32)
	if err != nil {
		return SessionProof{}, 0, err
	}
	csrfToken, err := randomToken(32)
	if err != nil {
		return SessionProof{}, 0, err
	}
	expiresAt := time.Now().UTC().Add(service.sessionTTL)
	record, err := queries.CreateSession(ctx, db.CreateSessionParams{
		UserID: previous.UserID, FamilyID: previous.FamilyID, RefreshDigest: digest(token), CsrfDigest: digest(csrfToken),
		PreviousSessionID: pgtype.Int8{Int64: previous.ID, Valid: true}, SessionKind: "full", DeviceLabel: optionalText(device),
		UserAgentSummary: optionalText(userAgent), IpPrefix: optionalText(ipPrefix), ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return SessionProof{}, 0, err
	}
	return SessionProof{UserID: previous.UserID, Token: token, CSRFToken: csrfToken, ExpiresAt: expiresAt, Onboarding: onboarding, Kind: "full"}, record.ID, nil
}

func (service *Service) Logout(ctx context.Context, rawSession, csrfToken string) error {
	queries := db.New(service.pool)
	session, err := service.authenticateFullSession(ctx, queries, rawSession)
	if err != nil {
		return nil
	}
	if err := verifyCSRF(session, csrfToken); err != nil {
		return err
	}
	_, err = queries.RevokeSession(ctx, db.RevokeSessionParams{ID: session.ID, RevocationReason: pgtype.Text{String: "logout", Valid: true}})
	return err
}

func (service *Service) LogoutAll(ctx context.Context, rawSession, csrfToken string) error {
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	session, err := service.authenticateFullSession(ctx, queries, rawSession)
	if err != nil {
		return err
	}
	if err := verifyCSRF(session, csrfToken); err != nil {
		return err
	}
	if _, err = queries.RevokeAllUserSessions(ctx, db.RevokeAllUserSessionsParams{UserID: session.UserID, RevocationReason: pgtype.Text{String: "logout_all", Valid: true}}); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1, 'sessions_revoked_all', 'user', $1::bigint::text, '{}'::jsonb)`, session.UserID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO outbox_jobs (job_type, aggregate_type, aggregate_id, payload) VALUES ('security_sessions_revoked', 'user', $1::bigint::text, jsonb_build_object('user_id', $1::bigint))`, session.UserID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (service *Service) ListSessions(ctx context.Context, rawSession string) ([]SessionSummary, error) {
	queries := db.New(service.pool)
	current, err := service.authenticateFullSession(ctx, queries, rawSession)
	if err != nil {
		return nil, err
	}
	records, err := queries.ListActiveUserSessions(ctx, current.UserID)
	if err != nil {
		return nil, err
	}
	result := make([]SessionSummary, 0, len(records))
	for _, record := range records {
		result = append(result, SessionSummary{ID: record.ID, DeviceLabel: record.DeviceLabel.String, UserAgentSummary: record.UserAgentSummary.String, IssuedAt: record.IssuedAt.Time, ExpiresAt: record.ExpiresAt.Time, LastSeenAt: record.LastSeenAt.Time, Current: record.ID == current.ID})
	}
	return result, nil
}

func (service *Service) RevokeSelectedSession(ctx context.Context, rawSession, csrfToken string, sessionID int64) error {
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	current, err := service.authenticateFullSession(ctx, queries, rawSession)
	if err != nil {
		return err
	}
	if err := verifyCSRF(current, csrfToken); err != nil {
		return err
	}
	updated, err := queries.RevokeOwnedSession(ctx, db.RevokeOwnedSessionParams{ID: sessionID, UserID: current.UserID})
	if err != nil {
		return err
	}
	if updated == 0 {
		return ErrInvalidProof
	}
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1, 'session_revoked', 'session', $2::bigint::text, '{}'::jsonb)`, current.UserID, sessionID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
