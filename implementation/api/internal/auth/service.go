package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidProof       = errors.New("invalid or expired proof")
	ErrRateLimited        = errors.New("too many attempts")
	ErrPasswordExists     = errors.New("password already exists")
	ErrSeatLimitReached   = errors.New("workspace seat limit reached")
	ErrFinalLoginMethod   = errors.New("cannot remove final login or recovery method")
)

type SessionProof struct {
	UserID     int64
	Token      string
	CSRFToken  string
	ExpiresAt  time.Time
	Onboarding string
	Kind       string
}

type Service struct {
	pool       *pgxpool.Pool
	hasher     PasswordHasher
	digestKey  []byte
	sessionTTL time.Duration
	dummyHash  string
}

func NewService(pool *pgxpool.Pool, digestKey string, sessionTTL time.Duration) (*Service, error) {
	hasher := NewPasswordHasher(LaunchArgon2idParams())
	dummyHash, err := hasher.Hash("rekordly-dummy-password")
	if err != nil {
		return nil, err
	}
	return &Service{pool: pool, hasher: hasher, digestKey: []byte(digestKey), sessionTTL: sessionTTL, dummyHash: dummyHash}, nil
}

func NormalizeEmail(value string) (string, error) {
	value = strings.TrimSpace(value)
	parsed, err := mail.ParseAddress(value)
	if err != nil || !strings.EqualFold(parsed.Address, value) || !strings.Contains(parsed.Address, "@") {
		return "", errors.New("invalid email")
	}
	return strings.ToLower(parsed.Address), nil
}

func (service *Service) EmailContinuation(ctx context.Context, email, clientKey string) (string, error) {
	normalized, err := NormalizeEmail(email)
	if err != nil {
		return "", err
	}
	queries := db.New(service.pool)
	if err := service.ensureNotBlocked(ctx, queries, service.subjectDigest("email_continue", normalized, clientKey), "email_continue"); err != nil {
		return "", err
	}
	_, _ = queries.RecordAuthRateLimitFailure(ctx, db.RecordAuthRateLimitFailureParams{SubjectDigest: service.subjectDigest("email_continue", normalized, clientKey), Action: "email_continue", WindowSeconds: 900, MaxAttempts: 20, BlockSeconds: 900})
	_, err = queries.GetActiveEmailIdentity(ctx, pgtype.Text{String: normalized, Valid: true})
	if err == nil {
		return "password", nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	return "registration", nil
}

func (service *Service) SignIn(ctx context.Context, email, password, clientKey, device, userAgent, ipPrefix string) (SessionProof, error) {
	normalized, err := NormalizeEmail(email)
	if err != nil {
		return SessionProof{}, ErrInvalidCredentials
	}
	queries := db.New(service.pool)
	subject := service.subjectDigest("password_sign_in", normalized, clientKey)
	if err := service.ensureNotBlocked(ctx, queries, subject, "password_sign_in"); err != nil {
		return SessionProof{}, err
	}
	record, lookupErr := queries.GetPasswordSignInRecord(ctx, pgtype.Text{String: normalized, Valid: true})
	encodedHash := service.dummyHash
	if lookupErr == nil {
		encodedHash = record.EncodedHash
	} else if !errors.Is(lookupErr, pgx.ErrNoRows) {
		return SessionProof{}, lookupErr
	}
	valid, verifyErr := service.hasher.Verify(password, encodedHash)
	if verifyErr != nil || lookupErr != nil || !valid || record.UserStatus != "active" {
		_, _ = queries.RecordAuthRateLimitFailure(ctx, db.RecordAuthRateLimitFailureParams{SubjectDigest: subject, Action: "password_sign_in", WindowSeconds: 900, MaxAttempts: 5, BlockSeconds: 900})
		return SessionProof{}, ErrInvalidCredentials
	}
	_, _ = queries.ClearAuthRateLimit(ctx, db.ClearAuthRateLimitParams{SubjectDigest: subject, Action: "password_sign_in"})
	if service.hasher.NeedsRehash(record.EncodedHash) {
		if rehashed, hashErr := service.hasher.Hash(password); hashErr == nil {
			_, _ = queries.RehashActivePasswordCredential(ctx, db.RehashActivePasswordCredentialParams{UserID: record.UserID, EncodedHash: rehashed})
		}
	}
	return service.createSession(ctx, queries, record.UserID, "full", record.OnboardingStatus, device, userAgent, ipPrefix)
}

func (service *Service) CreatePassword(ctx context.Context, preAuthToken, password, device, userAgent, ipPrefix string) (SessionProof, error) {
	if err := ValidatePassword(password); err != nil {
		return SessionProof{}, err
	}
	encodedHash, err := service.hasher.Hash(password)
	if err != nil {
		return SessionProof{}, err
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SessionProof{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	preAuthSession, err := queries.GetActivePreAuthSessionByDigest(ctx, digest(preAuthToken))
	if err != nil {
		return SessionProof{}, ErrInvalidProof
	}
	if _, err := queries.CreatePasswordCredential(ctx, db.CreatePasswordCredentialParams{UserID: preAuthSession.UserID, EncodedHash: encodedHash}); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return SessionProof{}, ErrPasswordExists
		}
		return SessionProof{}, err
	}
	_, err = queries.RevokeSession(ctx, db.RevokeSessionParams{ID: preAuthSession.ID, RevocationReason: pgtype.Text{String: "password_created", Valid: true}})
	if err != nil {
		return SessionProof{}, err
	}
	user, err := queries.GetUserByID(ctx, preAuthSession.UserID)
	if err != nil {
		return SessionProof{}, err
	}
	proof, err := service.createSession(ctx, queries, user.ID, "full", user.OnboardingStatus, device, userAgent, ipPrefix)
	if err != nil {
		return SessionProof{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SessionProof{}, err
	}
	return proof, nil
}

func (service *Service) RequestPasswordReset(ctx context.Context, email, clientKey string) error {
	normalized, err := NormalizeEmail(email)
	if err != nil {
		return nil
	}
	queries := db.New(service.pool)
	subject := service.subjectDigest("password_reset_request", normalized, clientKey)
	if err := service.ensureNotBlocked(ctx, queries, subject, "password_reset_request"); err != nil {
		return nil
	}
	_, _ = queries.RecordAuthRateLimitFailure(ctx, db.RecordAuthRateLimitFailureParams{SubjectDigest: subject, Action: "password_reset_request", WindowSeconds: 3600, MaxAttempts: 3, BlockSeconds: 3600})
	userID, err := queries.GetActiveUserIDByEmail(ctx, pgtype.Text{String: normalized, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = queries.EnqueuePasswordResetPreparation(ctx, fmt.Sprintf("%d", userID))
	return err
}

func (service *Service) CompletePasswordReset(ctx context.Context, resetToken, password, device, userAgent, ipPrefix string) (SessionProof, error) {
	if err := ValidatePassword(password); err != nil {
		return SessionProof{}, err
	}
	encodedHash, err := service.hasher.Hash(password)
	if err != nil {
		return SessionProof{}, err
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SessionProof{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	challenge, err := queries.ConsumePasswordResetChallenge(ctx, digest(resetToken))
	if err != nil || !challenge.UserID.Valid {
		return SessionProof{}, ErrInvalidProof
	}
	if _, err := queries.ReplaceActivePasswordCredential(ctx, challenge.UserID.Int64); err != nil {
		return SessionProof{}, err
	}
	if _, err := queries.CreatePasswordCredential(ctx, db.CreatePasswordCredentialParams{UserID: challenge.UserID.Int64, EncodedHash: encodedHash}); err != nil {
		return SessionProof{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sessions SET revoked_at = now(), revocation_reason = 'password_reset' WHERE user_id = $1 AND revoked_at IS NULL`, challenge.UserID.Int64); err != nil {
		return SessionProof{}, err
	}
	user, err := queries.GetUserByID(ctx, challenge.UserID.Int64)
	if err != nil {
		return SessionProof{}, err
	}
	proof, err := service.createSession(ctx, queries, user.ID, "full", user.OnboardingStatus, device, userAgent, ipPrefix)
	if err != nil {
		return SessionProof{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SessionProof{}, err
	}
	return proof, nil
}

func (service *Service) createSession(ctx context.Context, queries *db.Queries, userID int64, kind, onboarding, device, userAgent, ipPrefix string) (SessionProof, error) {
	token, err := randomToken(32)
	if err != nil {
		return SessionProof{}, err
	}
	csrfToken, err := randomToken(32)
	if err != nil {
		return SessionProof{}, err
	}
	familyBytes := make([]byte, 16)
	if _, err := rand.Read(familyBytes); err != nil {
		return SessionProof{}, err
	}
	familyBytes[6] = (familyBytes[6] & 0x0f) | 0x40
	familyBytes[8] = (familyBytes[8] & 0x3f) | 0x80
	var family [16]byte
	copy(family[:], familyBytes)
	expiresAt := time.Now().UTC().Add(service.sessionTTL)
	_, err = queries.CreateSession(ctx, db.CreateSessionParams{
		UserID: userID, FamilyID: pgtype.UUID{Bytes: family, Valid: true}, RefreshDigest: digest(token), CsrfDigest: digest(csrfToken),
		SessionKind: kind, DeviceLabel: optionalText(device), UserAgentSummary: optionalText(userAgent), IpPrefix: optionalText(ipPrefix),
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return SessionProof{}, err
	}
	return SessionProof{UserID: userID, Token: token, CSRFToken: csrfToken, ExpiresAt: expiresAt, Onboarding: onboarding, Kind: kind}, nil
}

func (service *Service) ensureNotBlocked(ctx context.Context, queries *db.Queries, subject []byte, action string) error {
	blockedUntil, err := queries.CheckAuthRateLimit(ctx, db.CheckAuthRateLimitParams{SubjectDigest: subject, Action: action})
	if errors.Is(err, pgx.ErrNoRows) || !blockedUntil.Valid {
		return nil
	}
	if err != nil {
		return err
	}
	if blockedUntil.Time.After(time.Now().UTC()) {
		return ErrRateLimited
	}
	return nil
}

func (service *Service) subjectDigest(action, normalized, clientKey string) []byte {
	mac := hmac.New(sha256.New, service.digestKey)
	_, _ = mac.Write([]byte(action + "\x00" + normalized + "\x00" + clientKey))
	return mac.Sum(nil)
}

func digest(value string) []byte {
	sum := sha256.Sum256([]byte(value))
	return sum[:]
}

func randomToken(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func optionalText(value string) pgtype.Text {
	value = strings.TrimSpace(value)
	return pgtype.Text{String: value, Valid: value != ""}
}
