package auth

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/stretchr/testify/require"
)

type authFixture struct {
	pool    *pgxpool.Pool
	service *Service
	userID  int64
	email   string
}

func newAuthFixture(t *testing.T) authFixture {
	t.Helper()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for auth integration tests")
	}
	pool, err := pgxpool.New(context.Background(), databaseURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	service, err := NewService(pool, "integration-test-digest-key", time.Hour)
	require.NoError(t, err)
	email := fmt.Sprintf("auth-%d@example.test", time.Now().UnixNano())
	var userID int64
	err = pool.QueryRow(context.Background(), `INSERT INTO users (display_name) VALUES ('Auth Test') RETURNING id`).Scan(&userID)
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(), `INSERT INTO auth_identities (user_id, provider, normalized_identifier, verified_at) VALUES ($1, 'email', $2, now())`, userID, email)
	require.NoError(t, err)
	t.Cleanup(func() {
		subjects := [][]byte{
			service.subjectDigest("password_sign_in", email, "client-a"),
			service.subjectDigest("password_sign_in", email, "client-b"),
			service.subjectDigest("password_sign_in", email, "client-c"),
			service.subjectDigest("password_reset_request", email, "known-client"),
		}
		_, _ = pool.Exec(context.Background(), `DELETE FROM auth_rate_limits WHERE subject_digest = ANY($1::bytea[])`, subjects)
		_, _ = pool.Exec(context.Background(), `DELETE FROM outbox_jobs WHERE aggregate_type = 'user' AND aggregate_id = $1`, fmt.Sprintf("%d", userID))
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	})
	return authFixture{pool: pool, service: service, userID: userID, email: email}
}

func (fixture authFixture) createPreAuthSession(t *testing.T, token string) {
	t.Helper()
	var family [16]byte
	copy(family[:], []byte("integration-test"))
	_, err := db.New(fixture.pool).CreateSession(context.Background(), db.CreateSessionParams{
		UserID: fixture.userID, FamilyID: pgtype.UUID{Bytes: family, Valid: true}, RefreshDigest: digest(token), SessionKind: "pre_auth",
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	})
	require.NoError(t, err)
}

func TestConcurrentPasswordCreationCreatesOneCredential(t *testing.T) {
	fixture := newAuthFixture(t)
	preAuthToken := "verified-pre-auth-token"
	fixture.createPreAuthSession(t, preAuthToken)
	errs := make([]error, 2)
	start := make(chan struct{})
	var wait sync.WaitGroup
	for index := range errs {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			_, errs[index] = fixture.service.CreatePassword(context.Background(), preAuthToken, "safe launch password", "", "", "")
		}(index)
	}
	close(start)
	wait.Wait()
	var successes int
	for _, err := range errs {
		if err == nil {
			successes++
			continue
		}
		require.True(t, errors.Is(err, ErrInvalidProof) || errors.Is(err, ErrPasswordExists), "unexpected error: %v", err)
	}
	require.Equal(t, 1, successes)
	var activeCredentials int
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM password_credentials WHERE user_id = $1 AND status = 'active'`, fixture.userID).Scan(&activeCredentials))
	require.Equal(t, 1, activeCredentials)
}

func TestPasswordSignInAndResetLifecycle(t *testing.T) {
	fixture := newAuthFixture(t)
	preAuthToken := "pre-auth-for-reset-lifecycle"
	fixture.createPreAuthSession(t, preAuthToken)
	initial, err := fixture.service.CreatePassword(context.Background(), preAuthToken, "initial safe password", "browser", "test-agent", "")
	require.NoError(t, err)
	require.NotEmpty(t, initial.Token)

	_, err = fixture.service.SignIn(context.Background(), fixture.email, "wrong password", "client-a", "", "", "")
	require.ErrorIs(t, err, ErrInvalidCredentials)
	signedIn, err := fixture.service.SignIn(context.Background(), fixture.email, "initial safe password", "client-a", "", "", "")
	require.NoError(t, err)
	require.NotEmpty(t, signedIn.Token)

	resetToken := "single-use-reset-token"
	_, err = fixture.pool.Exec(context.Background(), `
		INSERT INTO magic_link_challenges (user_id, recipient_digest, token_digest, purpose, expires_at)
		VALUES ($1, $2, $3, 'password_reset', now() + interval '15 minutes')`, fixture.userID, digest(fixture.email), digest(resetToken))
	require.NoError(t, err)
	resetSession, err := fixture.service.CompletePasswordReset(context.Background(), resetToken, "replacement safe password", "", "", "")
	require.NoError(t, err)
	require.NotEmpty(t, resetSession.Token)

	_, err = fixture.service.CompletePasswordReset(context.Background(), resetToken, "another replacement password", "", "", "")
	require.ErrorIs(t, err, ErrInvalidProof)
	_, err = fixture.service.SignIn(context.Background(), fixture.email, "initial safe password", "client-b", "", "", "")
	require.ErrorIs(t, err, ErrInvalidCredentials)
	_, err = fixture.service.SignIn(context.Background(), fixture.email, "replacement safe password", "client-c", "", "", "")
	require.NoError(t, err)

	var revokedOldSessions int
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM sessions WHERE user_id = $1 AND refresh_digest IN ($2, $3) AND revoked_at IS NOT NULL`, fixture.userID, digest(initial.Token), digest(signedIn.Token)).Scan(&revokedOldSessions))
	require.Equal(t, 2, revokedOldSessions)
}

func TestResetRequestIsNeutralAndContainsNoToken(t *testing.T) {
	fixture := newAuthFixture(t)
	require.NoError(t, fixture.service.RequestPasswordReset(context.Background(), "missing@example.test", "unknown-client"))
	require.NoError(t, fixture.service.RequestPasswordReset(context.Background(), fixture.email, "known-client"))
	var payload string
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT payload::text FROM outbox_jobs WHERE job_type = 'prepare_password_reset' AND aggregate_id = $1 ORDER BY id DESC LIMIT 1`, fmt.Sprintf("%d", fixture.userID)).Scan(&payload))
	require.NotContains(t, payload, "token")
	require.NotContains(t, payload, fixture.email)
}

func TestConcurrentOTPVerificationConsumesOnce(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for auth integration tests")
	}
	pool, err := pgxpool.New(context.Background(), databaseURL)
	require.NoError(t, err)
	defer pool.Close()
	service, err := NewService(pool, "integration-test-digest-key", time.Hour)
	require.NoError(t, err)
	email := fmt.Sprintf("otp-race-%d@example.test", time.Now().UnixNano())
	code := "483921"
	_, err = pool.Exec(context.Background(), `
		INSERT INTO otp_challenges (recipient_digest, code_digest, purpose, generation, expires_at)
		VALUES ($1, $2, 'registration', 1, now() + interval '10 minutes')`, service.recipientDigest(email), service.otpDigest(email, "registration", 1, code))
	require.NoError(t, err)
	t.Cleanup(func() {
		var userID int64
		if err := pool.QueryRow(context.Background(), `SELECT user_id FROM auth_identities WHERE provider = 'email' AND normalized_identifier = $1`, email).Scan(&userID); err == nil {
			_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
		}
		_, _ = pool.Exec(context.Background(), `DELETE FROM otp_challenges WHERE recipient_digest = $1`, service.recipientDigest(email))
	})
	errs := make([]error, 2)
	start := make(chan struct{})
	var wait sync.WaitGroup
	for index := range errs {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			_, errs[index] = service.VerifyOTP(context.Background(), email, "registration", code, "", "", "")
		}(index)
	}
	close(start)
	wait.Wait()
	var successes, rejected int
	for _, verifyErr := range errs {
		if verifyErr == nil {
			successes++
		} else if errors.Is(verifyErr, ErrInvalidProof) {
			rejected++
		} else {
			t.Fatalf("unexpected verification error: %v", verifyErr)
		}
	}
	require.Equal(t, 1, successes)
	require.Equal(t, 1, rejected)
}

func TestOTPPurposeAndGenerationIsolation(t *testing.T) {
	fixture := newAuthFixture(t)
	oldCode, currentCode := "111111", "222222"
	recipient := fixture.service.recipientDigest(fixture.email)
	_, err := fixture.pool.Exec(context.Background(), `
		INSERT INTO otp_challenges (user_id, recipient_digest, code_digest, purpose, generation, expires_at, invalidated_at)
		VALUES ($1, $2, $3, 'sign_in', 1, now() + interval '10 minutes', now()),
		       ($1, $2, $4, 'sign_in', 2, now() + interval '10 minutes', NULL)`, fixture.userID, recipient, fixture.service.otpDigest(fixture.email, "sign_in", 1, oldCode), fixture.service.otpDigest(fixture.email, "sign_in", 2, currentCode))
	require.NoError(t, err)
	_, err = fixture.service.VerifyOTP(context.Background(), fixture.email, "registration", currentCode, "", "", "")
	require.ErrorIs(t, err, ErrInvalidProof)
	_, err = fixture.service.VerifyOTP(context.Background(), fixture.email, "sign_in", oldCode, "", "", "")
	require.ErrorIs(t, err, ErrInvalidProof)
	_, err = fixture.service.VerifyOTP(context.Background(), fixture.email, "sign_in", currentCode, "", "", "")
	require.NoError(t, err)
}

func TestGoogleMatchingEmailRequiresExistingPasswordProof(t *testing.T) {
	fixture := newAuthFixture(t)
	encoded, err := fixture.service.hasher.Hash("existing account password")
	require.NoError(t, err)
	_, err = fixture.pool.Exec(context.Background(), `INSERT INTO password_credentials (user_id, encoded_hash) VALUES ($1, $2)`, fixture.userID, encoded)
	require.NoError(t, err)
	claims := GoogleClaims{Email: fixture.email, EmailVerified: true, RegisteredClaims: jwt.RegisteredClaims{Issuer: "https://accounts.google.com", Subject: fmt.Sprintf("subject-%d", time.Now().UnixNano())}}
	result, err := fixture.service.CompleteGoogleIdentity(context.Background(), claims, "", "", "")
	require.NoError(t, err)
	require.True(t, result.RequiresLinkProof)
	require.Empty(t, result.Session.Token)
	var googleIdentityCount int
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM auth_identities WHERE user_id = $1 AND provider = 'google'`, fixture.userID).Scan(&googleIdentityCount))
	require.Zero(t, googleIdentityCount)
	_, err = fixture.service.CompleteGoogleLinkWithPassword(context.Background(), result.LinkProofToken, "wrong account password", "", "", "")
	require.ErrorIs(t, err, ErrInvalidCredentials)
	proof, err := fixture.service.CompleteGoogleLinkWithPassword(context.Background(), result.LinkProofToken, "existing account password", "", "", "")
	require.NoError(t, err)
	require.Equal(t, "full", proof.Kind)
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM auth_identities WHERE user_id = $1 AND provider = 'google' AND status = 'active'`, fixture.userID).Scan(&googleIdentityCount))
	require.Equal(t, 1, googleIdentityCount)
}

func TestNewGoogleAccountRequiresPasswordCreation(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for auth integration tests")
	}
	pool, err := pgxpool.New(context.Background(), databaseURL)
	require.NoError(t, err)
	defer pool.Close()
	service, err := NewService(pool, "integration-test-digest-key", time.Hour)
	require.NoError(t, err)
	email := fmt.Sprintf("google-new-%d@example.test", time.Now().UnixNano())
	claims := GoogleClaims{Email: email, EmailVerified: true, Name: "Google User", RegisteredClaims: jwt.RegisteredClaims{Issuer: "https://accounts.google.com", Subject: fmt.Sprintf("subject-%d", time.Now().UnixNano())}}
	result, err := service.CompleteGoogleIdentity(context.Background(), claims, "", "", "")
	require.NoError(t, err)
	require.False(t, result.RequiresLinkProof)
	require.Equal(t, "pre_auth", result.Session.Kind)
	var userID int64
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT user_id FROM auth_identities WHERE provider = 'google' AND provider_subject = $1`, claims.Subject).Scan(&userID))
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID) })
}

func TestConcurrentInvitationAcceptanceCreatesOneMembership(t *testing.T) {
	owner := newAuthFixture(t)
	invitee := newAuthFixture(t)
	suffix := time.Now().UnixNano()
	var workspaceID, ownerRoleID, memberRoleID int64
	require.NoError(t, owner.pool.QueryRow(context.Background(), `
		INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id)
		VALUES ('business', 'Invitation Test', $1, 'NGN', $2) RETURNING id`, fmt.Sprintf("invitation-test-%d", suffix), owner.userID).Scan(&workspaceID))
	require.NoError(t, owner.pool.QueryRow(context.Background(), `INSERT INTO roles (workspace_id, code, name) VALUES ($1, 'owner', 'Owner') RETURNING id`, workspaceID).Scan(&ownerRoleID))
	require.NoError(t, owner.pool.QueryRow(context.Background(), `INSERT INTO roles (workspace_id, code, name) VALUES ($1, 'staff', 'Staff') RETURNING id`, workspaceID).Scan(&memberRoleID))
	_, err := owner.pool.Exec(context.Background(), `INSERT INTO memberships (workspace_id, user_id, role_id, is_owner) VALUES ($1, $2, $3, true)`, workspaceID, owner.userID, ownerRoleID)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = owner.pool.Exec(context.Background(), `DELETE FROM workspaces WHERE id = $1`, workspaceID)
	})

	preAuthToken := "invitation-accept-preauth"
	invitee.createPreAuthSession(t, preAuthToken)
	proof, err := invitee.service.CreatePassword(context.Background(), preAuthToken, "invitation member password", "", "", "")
	require.NoError(t, err)
	invitationToken := "high-entropy-invitation-token-for-test"
	_, err = owner.pool.Exec(context.Background(), `
		INSERT INTO invitations (workspace_id, invited_by_user_id, role_id, destination_normalized, destination_digest, token_digest, outlet_scope, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, '{"outlet_ids":[7]}'::jsonb, now() + interval '1 hour')`,
		workspaceID, owner.userID, memberRoleID, invitee.email, invitee.service.recipientDigest(invitee.email), digest(invitationToken))
	require.NoError(t, err)

	errs := make([]error, 2)
	start := make(chan struct{})
	var wait sync.WaitGroup
	for index := range errs {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			errs[index] = invitee.service.AcceptInvitation(context.Background(), proof.Token, proof.CSRFToken, invitationToken)
		}(index)
	}
	close(start)
	wait.Wait()
	require.NoError(t, errs[0])
	require.NoError(t, errs[1])
	var count int
	require.NoError(t, owner.pool.QueryRow(context.Background(), `SELECT count(*) FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND status = 'active'`, workspaceID, invitee.userID).Scan(&count))
	require.Equal(t, 1, count)
	var roleID int64
	var outletScope string
	require.NoError(t, owner.pool.QueryRow(context.Background(), `SELECT role_id, outlet_scope::text FROM memberships WHERE workspace_id = $1 AND user_id = $2`, workspaceID, invitee.userID).Scan(&roleID, &outletScope))
	require.Equal(t, memberRoleID, roleID)
	require.JSONEq(t, `{"outlet_ids":[7]}`, outletScope)
}

func TestRevokedInvitationCannotGrantMembership(t *testing.T) {
	owner := newAuthFixture(t)
	invitee := newAuthFixture(t)
	workspaceID, roleID := createInvitationWorkspace(t, owner, 2)
	proof := createFullSession(t, invitee, "revoked-invitation-session")
	token := fmt.Sprintf("revoked-token-%d", time.Now().UnixNano())
	_, err := owner.pool.Exec(context.Background(), `
		INSERT INTO invitations (workspace_id, invited_by_user_id, role_id, destination_normalized, destination_digest, token_digest, status, expires_at, revoked_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'revoked', now() + interval '1 hour', now())`,
		workspaceID, owner.userID, roleID, invitee.email, invitee.service.recipientDigest(invitee.email), digest(token))
	require.NoError(t, err)
	require.ErrorIs(t, invitee.service.AcceptInvitation(context.Background(), proof.Token, proof.CSRFToken, token), ErrInvalidProof)
	var memberships int
	require.NoError(t, owner.pool.QueryRow(context.Background(), `SELECT count(*) FROM memberships WHERE workspace_id = $1 AND user_id = $2`, workspaceID, invitee.userID).Scan(&memberships))
	require.Zero(t, memberships)
}

func TestInvitationSeatLimitIsRecheckedAtAcceptance(t *testing.T) {
	owner := newAuthFixture(t)
	invitee := newAuthFixture(t)
	workspaceID, roleID := createInvitationWorkspace(t, owner, 0)
	proof := createFullSession(t, invitee, "seat-limit-session")
	token := fmt.Sprintf("seat-limit-token-%d", time.Now().UnixNano())
	_, err := owner.pool.Exec(context.Background(), `
		INSERT INTO invitations (workspace_id, invited_by_user_id, role_id, destination_normalized, destination_digest, token_digest, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, now() + interval '1 hour')`,
		workspaceID, owner.userID, roleID, invitee.email, invitee.service.recipientDigest(invitee.email), digest(token))
	require.NoError(t, err)
	require.ErrorIs(t, invitee.service.AcceptInvitation(context.Background(), proof.Token, proof.CSRFToken, token), ErrSeatLimitReached)
}

func TestGoogleDisconnectRequiresAnotherRecoveryMethod(t *testing.T) {
	fixture := newAuthFixture(t)
	proof := createFullSession(t, fixture, "google-disconnect-session")
	_, err := fixture.pool.Exec(context.Background(), `
		INSERT INTO auth_identities (user_id, provider, provider_issuer, provider_subject, normalized_identifier, display_identifier, verified_at)
		VALUES ($1, 'google', 'https://accounts.google.com', $2, $3, $3, now())`, fixture.userID, fmt.Sprintf("disconnect-%d", time.Now().UnixNano()), fixture.email)
	require.NoError(t, err)
	_, err = fixture.pool.Exec(context.Background(), `DELETE FROM password_credentials WHERE user_id = $1`, fixture.userID)
	require.NoError(t, err)
	_, err = fixture.pool.Exec(context.Background(), `DELETE FROM auth_identities WHERE user_id = $1 AND provider = 'email'`, fixture.userID)
	require.NoError(t, err)
	require.ErrorIs(t, fixture.service.DisconnectGoogle(context.Background(), proof.Token, proof.CSRFToken), ErrFinalLoginMethod)
}

func createFullSession(t *testing.T, fixture authFixture, token string) SessionProof {
	t.Helper()
	fixture.createPreAuthSession(t, token)
	proof, err := fixture.service.CreatePassword(context.Background(), token, "integration test password", "", "", "")
	require.NoError(t, err)
	return proof
}

func createInvitationWorkspace(t *testing.T, owner authFixture, staffLimit int) (int64, int64) {
	t.Helper()
	var workspaceID, ownerRoleID, memberRoleID int64
	suffix := time.Now().UnixNano()
	require.NoError(t, owner.pool.QueryRow(context.Background(), `
		INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id, staff_seat_limit)
		VALUES ('business', 'Invitation Guard Test', $1, 'NGN', $2, $3) RETURNING id`, fmt.Sprintf("invitation-guard-%d", suffix), owner.userID, staffLimit).Scan(&workspaceID))
	require.NoError(t, owner.pool.QueryRow(context.Background(), `INSERT INTO roles (workspace_id, code, name) VALUES ($1, 'owner', 'Owner') RETURNING id`, workspaceID).Scan(&ownerRoleID))
	require.NoError(t, owner.pool.QueryRow(context.Background(), `INSERT INTO roles (workspace_id, code, name) VALUES ($1, 'staff', 'Staff') RETURNING id`, workspaceID).Scan(&memberRoleID))
	_, err := owner.pool.Exec(context.Background(), `INSERT INTO memberships (workspace_id, user_id, role_id, is_owner) VALUES ($1, $2, $3, true)`, workspaceID, owner.userID, ownerRoleID)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = owner.pool.Exec(context.Background(), `DELETE FROM workspaces WHERE id = $1`, workspaceID)
	})
	return workspaceID, memberRoleID
}

func TestSessionRotationGraceAndReplayRevokesFamily(t *testing.T) {
	fixture := newAuthFixture(t)
	proof := createFullSession(t, fixture, "rotation-preauth")
	replacement, err := fixture.service.RefreshSession(context.Background(), proof.Token, proof.CSRFToken, "browser", "test-agent", "")
	require.NoError(t, err)
	require.NotEqual(t, proof.Token, replacement.Token)
	_, err = fixture.service.RefreshSession(context.Background(), proof.Token, proof.CSRFToken, "browser", "test-agent", "")
	require.ErrorIs(t, err, ErrRefreshInProgress)
	_, err = fixture.pool.Exec(context.Background(), `UPDATE sessions SET rotated_at = now() - interval '11 seconds' WHERE refresh_digest = $1`, digest(proof.Token))
	require.NoError(t, err)
	_, err = fixture.service.RefreshSession(context.Background(), proof.Token, proof.CSRFToken, "browser", "test-agent", "")
	require.ErrorIs(t, err, ErrSessionReplayed)
	_, err = fixture.service.ListSessions(context.Background(), replacement.Token)
	require.ErrorIs(t, err, ErrInvalidProof)
}

func TestSessionManagementOwnershipAndLogoutAll(t *testing.T) {
	fixture := newAuthFixture(t)
	other := newAuthFixture(t)
	current := createFullSession(t, fixture, "session-management-current")
	second, err := fixture.service.SignIn(context.Background(), fixture.email, "integration test password", "second", "phone", "agent", "")
	require.NoError(t, err)
	otherProof := createFullSession(t, other, "other-session")
	var otherSessionID int64
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT id FROM sessions WHERE refresh_digest = $1`, digest(otherProof.Token)).Scan(&otherSessionID))
	require.ErrorIs(t, fixture.service.RevokeSelectedSession(context.Background(), current.Token, current.CSRFToken, otherSessionID), ErrInvalidProof)
	sessions, err := fixture.service.ListSessions(context.Background(), current.Token)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(sessions), 2)
	var secondID int64
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT id FROM sessions WHERE refresh_digest = $1`, digest(second.Token)).Scan(&secondID))
	require.NoError(t, fixture.service.RevokeSelectedSession(context.Background(), current.Token, current.CSRFToken, secondID))
	require.NoError(t, fixture.service.LogoutAll(context.Background(), current.Token, current.CSRFToken))
	_, err = fixture.service.ListSessions(context.Background(), current.Token)
	require.ErrorIs(t, err, ErrInvalidProof)
}

func TestConcurrentOnboardingCreatesOneWorkspaceSet(t *testing.T) {
	fixture := newAuthFixture(t)
	proof := createFullSession(t, fixture, "onboarding-session")
	input := CreateWorkspacesInput{
		SpaceChoice: "all",
		Personal:    &WorkspaceSetup{Name: "My Money", BaseCurrency: "NGN", Timezone: "Africa/Lagos"},
		Business:    &WorkspaceSetup{Name: "Launch Business", BaseCurrency: "NGN", Timezone: "Africa/Lagos", BusinessType: "services", Country: "NG"},
	}
	results := make([]CreateWorkspacesResult, 2)
	errs := make([]error, 2)
	start := make(chan struct{})
	var wait sync.WaitGroup
	for index := range errs {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			results[index], errs[index] = fixture.service.CreateInitialWorkspaces(context.Background(), proof.Token, proof.CSRFToken, "same-onboarding-key", input)
		}(index)
	}
	close(start)
	wait.Wait()
	require.NoError(t, errs[0])
	require.NoError(t, errs[1])
	require.Equal(t, results[0], results[1])
	var workspaceCount, ownerMembershipCount, auditCount, outboxCount int
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM workspaces WHERE owner_user_id = $1 AND status = 'active'`, fixture.userID).Scan(&workspaceCount))
	require.Equal(t, 2, workspaceCount)
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM memberships WHERE user_id = $1 AND is_owner AND status = 'active'`, fixture.userID).Scan(&ownerMembershipCount))
	require.Equal(t, 2, ownerMembershipCount)
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_events WHERE actor_user_id = $1 AND event_type = 'onboarding_core_completed'`, fixture.userID).Scan(&auditCount))
	require.Equal(t, 1, auditCount)
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM outbox_jobs WHERE aggregate_type = 'user' AND aggregate_id = $1 AND job_type = 'onboarding_welcome'`, fmt.Sprintf("%d", fixture.userID)).Scan(&outboxCount))
	require.Equal(t, 1, outboxCount)
	t.Cleanup(func() {
		_, _ = fixture.pool.Exec(context.Background(), `DELETE FROM workspaces WHERE owner_user_id = $1`, fixture.userID)
	})
}

func TestOnboardingIdempotencyMismatchIsRejected(t *testing.T) {
	fixture := newAuthFixture(t)
	proof := createFullSession(t, fixture, "onboarding-mismatch-session")
	first := CreateWorkspacesInput{SpaceChoice: "personal", Personal: &WorkspaceSetup{Name: "Personal One", BaseCurrency: "NGN", Timezone: "Africa/Lagos"}}
	_, err := fixture.service.CreateInitialWorkspaces(context.Background(), proof.Token, proof.CSRFToken, "mismatch-key-01", first)
	require.NoError(t, err)
	second := CreateWorkspacesInput{SpaceChoice: "personal", Personal: &WorkspaceSetup{Name: "Changed Name", BaseCurrency: "NGN", Timezone: "Africa/Lagos"}}
	_, err = fixture.service.CreateInitialWorkspaces(context.Background(), proof.Token, proof.CSRFToken, "mismatch-key-01", second)
	require.ErrorIs(t, err, ErrIdempotencyConflict)
	t.Cleanup(func() {
		_, _ = fixture.pool.Exec(context.Background(), `DELETE FROM workspaces WHERE owner_user_id = $1`, fixture.userID)
	})
}

func TestCurrentUserOnlyReturnsAuthorizedWorkspaces(t *testing.T) {
	owner := newAuthFixture(t)
	member := newAuthFixture(t)
	ownerProof := createFullSession(t, owner, "owner-current-user-session")
	memberProof := createFullSession(t, member, "member-current-user-session")
	ownerInput := CreateWorkspacesInput{
		SpaceChoice: "all",
		Personal:    &WorkspaceSetup{Name: "Owner Personal", BaseCurrency: "NGN", Timezone: "Africa/Lagos"},
		Business:    &WorkspaceSetup{Name: "Owner Business", BaseCurrency: "NGN", Timezone: "Africa/Lagos", BusinessType: "services", Country: "NG"},
	}
	created, err := owner.service.CreateInitialWorkspaces(context.Background(), ownerProof.Token, ownerProof.CSRFToken, "owner-workspaces-key", ownerInput)
	require.NoError(t, err)
	var businessID int64
	for _, workspace := range created.Workspaces {
		if workspace.Kind == "business" {
			businessID = workspace.ID
		}
	}
	var roleID int64
	require.NoError(t, owner.pool.QueryRow(context.Background(), `INSERT INTO roles (workspace_id, code, name) VALUES ($1, 'member', 'Member') RETURNING id`, businessID).Scan(&roleID))
	_, err = owner.pool.Exec(context.Background(), `INSERT INTO memberships (workspace_id, user_id, role_id) VALUES ($1, $2, $3)`, businessID, member.userID, roleID)
	require.NoError(t, err)
	current, err := member.service.CurrentUser(context.Background(), memberProof.Token)
	require.NoError(t, err)
	require.Len(t, current.Workspaces, 1)
	require.Equal(t, "business", current.Workspaces[0].Kind)
	require.False(t, current.Workspaces[0].IsOwner)
	t.Cleanup(func() {
		_, _ = owner.pool.Exec(context.Background(), `DELETE FROM workspaces WHERE owner_user_id = $1`, owner.userID)
	})
}

func TestOnboardingMandatoryFailureRollsBackEverything(t *testing.T) {
	fixture := newAuthFixture(t)
	proof := createFullSession(t, fixture, "onboarding-rollback-session")
	_, err := fixture.pool.Exec(context.Background(), `
		CREATE OR REPLACE FUNCTION rekordly_test_reject_onboarding_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN
			IF NEW.job_type = 'onboarding_welcome' THEN
				RAISE EXCEPTION 'forced onboarding outbox failure';
			END IF;
			RETURN NEW;
		END $$`)
	require.NoError(t, err)
	_, err = fixture.pool.Exec(context.Background(), `CREATE TRIGGER rekordly_test_reject_onboarding_outbox_trigger BEFORE INSERT ON outbox_jobs FOR EACH ROW EXECUTE FUNCTION rekordly_test_reject_onboarding_outbox()`)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = fixture.pool.Exec(context.Background(), `DROP TRIGGER IF EXISTS rekordly_test_reject_onboarding_outbox_trigger ON outbox_jobs`)
		_, _ = fixture.pool.Exec(context.Background(), `DROP FUNCTION IF EXISTS rekordly_test_reject_onboarding_outbox()`)
	})
	input := CreateWorkspacesInput{SpaceChoice: "personal", Personal: &WorkspaceSetup{Name: "Rollback Personal", BaseCurrency: "NGN", Timezone: "Africa/Lagos"}}
	_, err = fixture.service.CreateInitialWorkspaces(context.Background(), proof.Token, proof.CSRFToken, "rollback-key-01", input)
	require.Error(t, err)
	var workspaces, idempotency, audits int
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM workspaces WHERE owner_user_id = $1`, fixture.userID).Scan(&workspaces))
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM idempotency_records WHERE actor_user_id = $1 AND operation = 'create_initial_workspaces'`, fixture.userID).Scan(&idempotency))
	require.NoError(t, fixture.pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_events WHERE actor_user_id = $1 AND event_type = 'onboarding_core_completed'`, fixture.userID).Scan(&audits))
	require.Zero(t, workspaces)
	require.Zero(t, idempotency)
	require.Zero(t, audits)
}

func TestPreAuthCannotAccessCurrentUser(t *testing.T) {
	fixture := newAuthFixture(t)
	fixture.createPreAuthSession(t, "preauth-me-token")
	_, err := fixture.service.CurrentUser(context.Background(), "preauth-me-token")
	require.ErrorIs(t, err, ErrInvalidProof)
}
