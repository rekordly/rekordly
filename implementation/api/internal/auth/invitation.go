package auth

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type InvitationSummary struct {
	WorkspaceName string
	RoleName      string
	Destination   string
	ExpiresAt     time.Time
}

func (service *Service) InspectInvitation(ctx context.Context, rawToken string) (InvitationSummary, error) {
	invitation, err := db.New(service.pool).GetInvitationByTokenDigestForUpdate(ctx, digest(rawToken))
	if err != nil || invitation.Status != "pending" || invitation.ExpiresAt.Time.Before(time.Now()) {
		return InvitationSummary{}, ErrInvalidProof
	}
	var summary InvitationSummary
	err = service.pool.QueryRow(ctx, `SELECT w.name, r.name FROM workspaces w JOIN roles r ON r.id = $2 WHERE w.id = $1`, invitation.WorkspaceID, invitation.RoleID).Scan(&summary.WorkspaceName, &summary.RoleName)
	if err != nil {
		return InvitationSummary{}, err
	}
	summary.Destination = maskEmail(invitation.DestinationNormalized)
	summary.ExpiresAt = invitation.ExpiresAt.Time
	return summary, nil
}

func (service *Service) RequestInvitationOTP(ctx context.Context, rawToken, clientKey string) error {
	invitation, err := db.New(service.pool).GetInvitationByTokenDigestForUpdate(ctx, digest(rawToken))
	if err != nil || invitation.Status != "pending" || invitation.ExpiresAt.Time.Before(time.Now()) {
		return nil
	}
	subject := service.subjectDigest("otp_request", invitation.DestinationNormalized, clientKey)
	queries := db.New(service.pool)
	if err := service.ensureNotBlocked(ctx, queries, subject, "otp_request"); err != nil {
		return err
	}
	_, _ = queries.RecordAuthRateLimitFailure(ctx, db.RecordAuthRateLimitFailureParams{SubjectDigest: subject, Action: "otp_request", WindowSeconds: 3600, MaxAttempts: 5, BlockSeconds: 3600})
	payload, _ := json.Marshal(authEmailJob{Email: invitation.DestinationNormalized, Purpose: "invitation"})
	_, err = queries.EnqueueAuthEmailJob(ctx, db.EnqueueAuthEmailJobParams{JobType: "send_auth_otp", AggregateID: base64.RawURLEncoding.EncodeToString(service.recipientDigest(invitation.DestinationNormalized)), Payload: payload})
	return err
}

func (service *Service) VerifyInvitationOTP(ctx context.Context, rawToken, code, device, userAgent string) (SessionProof, error) {
	if !otpPattern.MatchString(code) {
		return SessionProof{}, ErrInvalidProof
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SessionProof{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	invitation, err := queries.GetInvitationByTokenDigestForUpdate(ctx, digest(rawToken))
	if err != nil || invitation.Status != "pending" || invitation.ExpiresAt.Time.Before(time.Now()) {
		return SessionProof{}, ErrInvalidProof
	}
	challenge, err := queries.GetLatestOTPChallengeForUpdate(ctx, db.GetLatestOTPChallengeForUpdateParams{RecipientDigest: service.recipientDigest(invitation.DestinationNormalized), Purpose: "invitation"})
	if err != nil || challenge.ExpiresAt.Time.Before(time.Now()) || challenge.ConsumedAt.Valid || challenge.InvalidatedAt.Valid {
		return SessionProof{}, ErrInvalidProof
	}
	expected := service.otpDigest(invitation.DestinationNormalized, "invitation", challenge.Generation, code)
	if subtle.ConstantTimeCompare(expected, challenge.CodeDigest) != 1 {
		_, _ = queries.IncrementOTPAttempts(ctx, challenge.ID)
		_ = tx.Commit(ctx)
		return SessionProof{}, ErrInvalidProof
	}
	if _, err := queries.ConsumeExactOTPChallenge(ctx, challenge.ID); err != nil {
		return SessionProof{}, ErrInvalidProof
	}
	userID, isNew, err := service.resolveVerifiedEmailUser(ctx, queries, invitation.DestinationNormalized)
	if err != nil {
		return SessionProof{}, err
	}
	hasPassword, err := queries.UserHasActivePassword(ctx, userID)
	if err != nil {
		return SessionProof{}, err
	}
	kind := "full"
	if isNew || !hasPassword {
		kind = "pre_auth"
	}
	user, err := queries.GetUserByID(ctx, userID)
	if err != nil {
		return SessionProof{}, err
	}
	proof, err := service.createSession(ctx, queries, userID, kind, user.OnboardingStatus, device, userAgent, "")
	if err != nil {
		return SessionProof{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SessionProof{}, err
	}
	return proof, nil
}

func (service *Service) AcceptInvitation(ctx context.Context, rawSession, csrfToken, rawInvitation string) error {
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	session, err := queries.GetActiveFullSessionByDigest(ctx, digest(rawSession))
	if err != nil || subtle.ConstantTimeCompare(session.CsrfDigest, digest(csrfToken)) != 1 {
		return ErrInvalidProof
	}
	invitation, err := queries.GetInvitationByTokenDigestForUpdate(ctx, digest(rawInvitation))
	if err != nil {
		return ErrInvalidProof
	}
	if invitation.Status == "accepted" && invitation.AcceptedByUserID.Valid && invitation.AcceptedByUserID.Int64 == session.UserID {
		return nil
	}
	if invitation.Status != "pending" || invitation.ExpiresAt.Time.Before(time.Now()) {
		return ErrInvalidProof
	}
	identity, err := queries.GetActiveEmailForUser(ctx, session.UserID)
	if err != nil || identity.NormalizedIdentifier.String != invitation.DestinationNormalized {
		return ErrInvalidProof
	}
	authorized, err := queries.InviterHasActiveMembership(ctx, db.InviterHasActiveMembershipParams{WorkspaceID: invitation.WorkspaceID, UserID: invitation.InvitedByUserID})
	if err != nil || !authorized {
		return ErrInvalidProof
	}
	roleAllowed, err := queries.InvitationRoleIsAllowed(ctx, db.InvitationRoleIsAllowedParams{ID: invitation.RoleID, WorkspaceID: pgtype.Int8{Int64: invitation.WorkspaceID, Valid: true}})
	if err != nil || !roleAllowed {
		return ErrInvalidProof
	}
	hasCapacity, err := queries.InvitationHasSeatCapacity(ctx, db.InvitationHasSeatCapacityParams{RoleID: invitation.RoleID, WorkspaceID: invitation.WorkspaceID})
	if err != nil {
		return ErrInvalidProof
	}
	if !hasCapacity {
		return ErrSeatLimitReached
	}
	_, err = queries.CreateMembership(ctx, db.CreateMembershipParams{WorkspaceID: invitation.WorkspaceID, UserID: session.UserID, RoleID: invitation.RoleID, IsOwner: false, OutletScope: invitation.OutletScope})
	if err != nil {
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
			return err
		}
		if _, existingErr := queries.GetActiveMembership(ctx, db.GetActiveMembershipParams{WorkspaceID: invitation.WorkspaceID, UserID: session.UserID}); existingErr != nil {
			return err
		}
	}
	if _, err := queries.AcceptInvitation(ctx, db.AcceptInvitationParams{ID: invitation.ID, AcceptedByUserID: pgtype.Int8{Int64: session.UserID, Valid: true}}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func maskEmail(value string) string {
	parts := strings.SplitN(value, "@", 2)
	if len(parts) != 2 || len(parts[0]) == 0 {
		return "***"
	}
	return parts[0][:1] + "***@" + parts[1]
}
