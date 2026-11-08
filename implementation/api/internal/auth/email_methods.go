package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var otpPattern = regexp.MustCompile(`^[0-9]{6}$`)

type authEmailJob struct {
	Email        string `json:"email"`
	Purpose      string `json:"purpose"`
	SafeReturnTo string `json:"safe_return_to,omitempty"`
}

func (service *Service) RequestOTP(ctx context.Context, email, purpose, clientKey string) error {
	normalized, err := NormalizeEmail(email)
	if err != nil || !allowedOTPPurpose(purpose) {
		return nil
	}
	queries := db.New(service.pool)
	subject := service.subjectDigest("otp_request", normalized, clientKey)
	if err := service.ensureNotBlocked(ctx, queries, subject, "otp_request"); err != nil {
		return err
	}
	_, _ = queries.RecordAuthRateLimitFailure(ctx, db.RecordAuthRateLimitFailureParams{SubjectDigest: subject, Action: "otp_request", WindowSeconds: 3600, MaxAttempts: 5, BlockSeconds: 3600})
	if purpose != "registration" {
		if _, err := queries.GetActiveUserIDByEmail(ctx, pgtype.Text{String: normalized, Valid: true}); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			return err
		}
	}
	payload, err := json.Marshal(authEmailJob{Email: normalized, Purpose: purpose})
	if err != nil {
		return err
	}
	_, err = queries.EnqueueAuthEmailJob(ctx, db.EnqueueAuthEmailJobParams{JobType: "send_auth_otp", AggregateID: base64.RawURLEncoding.EncodeToString(service.recipientDigest(normalized)), Payload: payload})
	return err
}

func (service *Service) VerifyOTP(ctx context.Context, email, purpose, code, device, userAgent, ipPrefix string) (SessionProof, error) {
	normalized, err := NormalizeEmail(email)
	if err != nil || !allowedOTPPurpose(purpose) || !otpPattern.MatchString(code) {
		return SessionProof{}, ErrInvalidProof
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SessionProof{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	challenge, err := queries.GetLatestOTPChallengeForUpdate(ctx, db.GetLatestOTPChallengeForUpdateParams{RecipientDigest: service.recipientDigest(normalized), Purpose: purpose})
	if err != nil || challenge.ConsumedAt.Valid || challenge.InvalidatedAt.Valid || challenge.ExpiresAt.Time.Before(time.Now().UTC()) || challenge.Attempts >= challenge.MaxAttempts {
		return SessionProof{}, ErrInvalidProof
	}
	expected := service.otpDigest(normalized, purpose, challenge.Generation, code)
	if subtle.ConstantTimeCompare(expected, challenge.CodeDigest) != 1 {
		_, _ = queries.IncrementOTPAttempts(ctx, challenge.ID)
		if err := tx.Commit(ctx); err != nil {
			return SessionProof{}, err
		}
		return SessionProof{}, ErrInvalidProof
	}
	if _, err := queries.ConsumeExactOTPChallenge(ctx, challenge.ID); err != nil {
		return SessionProof{}, ErrInvalidProof
	}
	userID, isNew, err := service.resolveVerifiedEmailUser(ctx, queries, normalized)
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
	proof, err := service.createSession(ctx, queries, userID, kind, user.OnboardingStatus, device, userAgent, ipPrefix)
	if err != nil {
		return SessionProof{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SessionProof{}, err
	}
	return proof, nil
}

func (service *Service) RequestMagicLink(ctx context.Context, email, safeReturnTo, clientKey string) error {
	normalized, err := NormalizeEmail(email)
	if err != nil {
		return nil
	}
	queries := db.New(service.pool)
	subject := service.subjectDigest("magic_request", normalized, clientKey)
	if err := service.ensureNotBlocked(ctx, queries, subject, "magic_request"); err != nil {
		return err
	}
	_, _ = queries.RecordAuthRateLimitFailure(ctx, db.RecordAuthRateLimitFailureParams{SubjectDigest: subject, Action: "magic_request", WindowSeconds: 3600, MaxAttempts: 5, BlockSeconds: 3600})
	if _, err := queries.GetActiveUserIDByEmail(ctx, pgtype.Text{String: normalized, Valid: true}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	payload, err := json.Marshal(authEmailJob{Email: normalized, Purpose: "sign_in", SafeReturnTo: safeReturnTo})
	if err != nil {
		return err
	}
	_, err = queries.EnqueueAuthEmailJob(ctx, db.EnqueueAuthEmailJobParams{JobType: "send_auth_magic_link", AggregateID: base64.RawURLEncoding.EncodeToString(service.recipientDigest(normalized)), Payload: payload})
	return err
}

func (service *Service) InspectMagicLink(ctx context.Context, token string) error {
	if len(token) < 32 {
		return ErrInvalidProof
	}
	challenge, err := db.New(service.pool).GetMagicLinkChallenge(ctx, digest(token))
	if err != nil || challenge.ConsumedAt.Valid || challenge.InvalidatedAt.Valid || challenge.ExpiresAt.Time.Before(time.Now().UTC()) {
		return ErrInvalidProof
	}
	return nil
}

func (service *Service) ConfirmMagicLink(ctx context.Context, token, device, userAgent, ipPrefix string) (SessionProof, error) {
	if len(token) < 32 {
		return SessionProof{}, ErrInvalidProof
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SessionProof{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	challenge, err := queries.ConsumeSignInMagicLink(ctx, digest(token))
	if err != nil || !challenge.UserID.Valid {
		return SessionProof{}, ErrInvalidProof
	}
	user, err := queries.GetUserByID(ctx, challenge.UserID.Int64)
	if err != nil {
		return SessionProof{}, err
	}
	hasPassword, err := queries.UserHasActivePassword(ctx, user.ID)
	if err != nil {
		return SessionProof{}, err
	}
	kind := "full"
	if !hasPassword {
		kind = "pre_auth"
	}
	proof, err := service.createSession(ctx, queries, user.ID, kind, user.OnboardingStatus, device, userAgent, ipPrefix)
	if err != nil {
		return SessionProof{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SessionProof{}, err
	}
	return proof, nil
}

func (service *Service) resolveVerifiedEmailUser(ctx context.Context, queries *db.Queries, normalized string) (int64, bool, error) {
	identity, err := queries.GetActiveEmailIdentity(ctx, pgtype.Text{String: normalized, Valid: true})
	if err == nil {
		return identity.UserID, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, false, err
	}
	user, err := queries.CreateUser(ctx, db.CreateUserParams{Locale: "en-NG", Timezone: "Africa/Lagos"})
	if err != nil {
		return 0, false, err
	}
	_, err = queries.CreateEmailIdentity(ctx, db.CreateEmailIdentityParams{
		UserID: user.ID, NormalizedIdentifier: pgtype.Text{String: normalized, Valid: true}, DisplayIdentifier: pgtype.Text{String: normalized, Valid: true},
		VerifiedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
	if err != nil {
		return 0, false, fmt.Errorf("create verified email identity: %w", err)
	}
	return user.ID, true, nil
}

func allowedOTPPurpose(purpose string) bool {
	return purpose == "registration" || purpose == "sign_in"
}

func (service *Service) recipientDigest(email string) []byte {
	mac := hmac.New(sha256.New, service.digestKey)
	_, _ = mac.Write([]byte("recipient\x00" + email))
	return mac.Sum(nil)
}

func (service *Service) otpDigest(email, purpose string, generation int32, code string) []byte {
	mac := hmac.New(sha256.New, service.digestKey)
	_, _ = fmt.Fprintf(mac, "otp\x00%s\x00%s\x00%d\x00%s", email, purpose, generation, code)
	return mac.Sum(nil)
}
