package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
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

type CreatedInvitationResult struct {
	ID         int64     `json:"id"`
	InviteURL  string    `json:"invite_url"`
	Token      string    `json:"token"`
	RoleCode   string    `json:"role_code"`
	RoleName   string    `json:"role_name"`
	ExpiresAt  time.Time `json:"expires_at"`
}

func (service *Service) CreateWorkspaceInvitation(
	ctx context.Context,
	sessionToken, csrfToken string,
	workspaceID int64,
	email, roleCode string,
	outletScope map[string]any,
) (CreatedInvitationResult, error) {
	session, err := db.New(service.pool).GetActiveFullSessionByDigest(ctx, digest(sessionToken))
	if err != nil || subtle.ConstantTimeCompare(session.CsrfDigest, digest(csrfToken)) != 1 {
		return CreatedInvitationResult{}, ErrInvalidProof
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	if normalizedEmail == "" || !strings.Contains(normalizedEmail, "@") {
		return CreatedInvitationResult{}, errors.New("valid email address is required")
	}

	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return CreatedInvitationResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Verify caller is an owner or admin in this workspace
	var isOwner bool
	var callerRoleCode string
	err = tx.QueryRow(ctx, `
		SELECT m.is_owner, r.code
		FROM memberships m
		JOIN roles r ON r.id = m.role_id
		WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.status = 'active'
	`, workspaceID, session.UserID).Scan(&isOwner, &callerRoleCode)
	if err != nil || (!isOwner && callerRoleCode != "admin") {
		return CreatedInvitationResult{}, ErrInvalidProof
	}

	rCode := strings.ToLower(strings.TrimSpace(roleCode))
	if rCode == "" {
		rCode = "staff"
	}
	if rCode == "owner" {
		return CreatedInvitationResult{}, errors.New("cannot invite directly as owner")
	}

	roleNames := map[string]string{
		"admin":      "Admin",
		"accountant": "Accountant",
		"cashier":    "Cashier",
		"staff":      "Staff",
		"viewer":     "Viewer",
	}
	rName, ok := roleNames[rCode]
	if !ok {
		rName = strings.ToUpper(rCode[:1]) + rCode[1:]
	}

	var roleID int64
	err = tx.QueryRow(ctx, `SELECT id FROM roles WHERE workspace_id = $1 AND code = $2`, workspaceID, rCode).Scan(&roleID)
	if errors.Is(err, pgx.ErrNoRows) {
		if err := tx.QueryRow(ctx, `INSERT INTO roles (workspace_id, code, name) VALUES ($1, $2, $3) RETURNING id`, workspaceID, rCode, rName).Scan(&roleID); err != nil {
			return CreatedInvitationResult{}, err
		}
		for _, pCode := range defaultPermissionsForRoleCode(rCode) {
			_, _ = tx.Exec(ctx, `INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`, roleID, pCode)
		}
	} else if err != nil {
		return CreatedInvitationResult{}, err
	}

	tokenBytes := make([]byte, 24)
	if _, err := rand.Read(tokenBytes); err != nil {
		return CreatedInvitationResult{}, err
	}
	rawToken := base64.RawURLEncoding.EncodeToString(tokenBytes)
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	scopeBytes := []byte(`{}`)
	if len(outletScope) > 0 {
		if b, mErr := json.Marshal(outletScope); mErr == nil {
			scopeBytes = b
		}
	}

	var invID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO invitations (
			workspace_id, invited_by_user_id, role_id,
			destination_normalized, destination_digest, token_digest,
			outlet_scope, status, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
		RETURNING id
	`, workspaceID, session.UserID, roleID, normalizedEmail, service.recipientDigest(normalizedEmail), digest(rawToken), scopeBytes, expiresAt).Scan(&invID)
	if err != nil {
		return CreatedInvitationResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return CreatedInvitationResult{}, err
	}

	return CreatedInvitationResult{
		ID:        invID,
		InviteURL: fmt.Sprintf("/invitations/%s", rawToken),
		Token:     rawToken,
		RoleCode:  rCode,
		RoleName:  rName,
		ExpiresAt: expiresAt,
	}, nil
}

func (service *Service) RevokeWorkspaceInvitation(ctx context.Context, sessionToken, csrfToken string, workspaceID, invitationID int64) error {
	session, err := db.New(service.pool).GetActiveFullSessionByDigest(ctx, digest(sessionToken))
	if err != nil || subtle.ConstantTimeCompare(session.CsrfDigest, digest(csrfToken)) != 1 {
		return ErrInvalidProof
	}
	var isOwner bool
	var callerRole string
	err = service.pool.QueryRow(ctx, `
		SELECT m.is_owner, r.code
		FROM memberships m
		JOIN roles r ON r.id = m.role_id
		WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.status = 'active'
	`, workspaceID, session.UserID).Scan(&isOwner, &callerRole)
	if err != nil || (!isOwner && callerRole != "admin") {
		return ErrInvalidProof
	}
	_, err = service.pool.Exec(ctx, `
		UPDATE invitations
		SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
	`, invitationID, workspaceID)
	return err
}
