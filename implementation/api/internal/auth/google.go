package auth

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var ErrGoogleUnavailable = errors.New("google sign-in is not configured")

type GoogleOptions struct {
	ClientID, ClientSecret, RedirectURL         string
	AuthorizationURL, TokenURL, JWKSURL, Issuer string
	FlowSecret                                  string
}

type GoogleOIDC struct {
	options GoogleOptions
	http    *http.Client
	aead    cipher.AEAD
}

type googleFlow struct {
	State, Nonce, Verifier, ReturnTo string
	ExpiresAt                        int64
}

type GoogleClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Nonce         string `json:"nonce"`
	jwt.RegisteredClaims
}

type GoogleAuthResult struct {
	Session           SessionProof
	RequiresLinkProof bool
	LinkProofToken    string
}

func NewGoogleOIDC(options GoogleOptions) (*GoogleOIDC, error) {
	key := sha256.Sum256([]byte(options.FlowSecret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &GoogleOIDC{options: options, http: &http.Client{Timeout: 10 * time.Second}, aead: aead}, nil
}

func (oidc *GoogleOIDC) Configured() bool {
	return oidc.options.ClientID != "" && oidc.options.ClientSecret != "" && oidc.options.RedirectURL != ""
}

func (oidc *GoogleOIDC) Start(ctx context.Context, queries *db.Queries, returnTo string) (string, string, error) {
	if !oidc.Configured() {
		return "", "", ErrGoogleUnavailable
	}
	state, _ := randomToken(32)
	nonce, _ := randomToken(32)
	verifier, _ := randomToken(48)
	flow := googleFlow{State: state, Nonce: nonce, Verifier: verifier, ReturnTo: returnTo, ExpiresAt: time.Now().Add(10 * time.Minute).Unix()}
	sealed, err := oidc.sealFlow(flow)
	if err != nil {
		return "", "", err
	}
	_, err = queries.CreateOAuthLoginAttempt(ctx, db.CreateOAuthLoginAttemptParams{
		Provider: "google", StateDigest: digest(state), NonceDigest: digest(nonce), PkceVerifierDigest: digest(verifier),
		SafeReturnContext: []byte(fmt.Sprintf(`{"return_to":%q}`, returnTo)), ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(10 * time.Minute), Valid: true},
	})
	if err != nil {
		return "", "", err
	}
	challenge := sha256.Sum256([]byte(verifier))
	values := url.Values{
		"client_id": {oidc.options.ClientID}, "redirect_uri": {oidc.options.RedirectURL}, "response_type": {"code"},
		"scope": {"openid email profile"}, "state": {state}, "nonce": {nonce},
		"code_challenge": {base64.RawURLEncoding.EncodeToString(challenge[:])}, "code_challenge_method": {"S256"},
	}
	return oidc.options.AuthorizationURL + "?" + values.Encode(), sealed, nil
}

func (oidc *GoogleOIDC) Callback(ctx context.Context, queries *db.Queries, code, state, sealedFlow string) (GoogleClaims, string, error) {
	flow, err := oidc.openFlow(sealedFlow)
	if err != nil || time.Now().Unix() >= flow.ExpiresAt || subtleCompare(flow.State, state) == false {
		return GoogleClaims{}, "", ErrInvalidProof
	}
	form := url.Values{"code": {code}, "client_id": {oidc.options.ClientID}, "client_secret": {oidc.options.ClientSecret}, "redirect_uri": {oidc.options.RedirectURL}, "grant_type": {"authorization_code"}, "code_verifier": {flow.Verifier}}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, oidc.options.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return GoogleClaims{}, "", err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := oidc.http.Do(request)
	if err != nil {
		return GoogleClaims{}, "", err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if err != nil || response.StatusCode != http.StatusOK {
		return GoogleClaims{}, "", ErrInvalidProof
	}
	var tokenResponse struct {
		IDToken string `json:"id_token"`
	}
	if json.Unmarshal(body, &tokenResponse) != nil || tokenResponse.IDToken == "" {
		return GoogleClaims{}, "", ErrInvalidProof
	}
	claims, err := oidc.validateIDToken(ctx, tokenResponse.IDToken, flow.Nonce)
	if err != nil {
		return GoogleClaims{}, "", err
	}
	if _, err := queries.CompleteOAuthLoginAttempt(ctx, digest(state)); err != nil {
		return GoogleClaims{}, "", ErrInvalidProof
	}
	return claims, flow.ReturnTo, nil
}

func (oidc *GoogleOIDC) validateIDToken(ctx context.Context, raw, expectedNonce string) (GoogleClaims, error) {
	keys, err := oidc.fetchKeys(ctx)
	if err != nil {
		return GoogleClaims{}, err
	}
	claims := GoogleClaims{}
	parser := jwt.NewParser(jwt.WithValidMethods([]string{"RS256"}), jwt.WithAudience(oidc.options.ClientID), jwt.WithIssuer(oidc.options.Issuer), jwt.WithExpirationRequired())
	token, err := parser.ParseWithClaims(raw, &claims, func(token *jwt.Token) (any, error) {
		kid, _ := token.Header["kid"].(string)
		key, ok := keys[kid]
		if !ok {
			return nil, errors.New("unknown signing key")
		}
		return key, nil
	})
	if err != nil || !token.Valid || !claims.EmailVerified || claims.Subject == "" || claims.Email == "" || !subtleCompare(claims.Nonce, expectedNonce) {
		return GoogleClaims{}, ErrInvalidProof
	}
	return claims, nil
}

func (oidc *GoogleOIDC) fetchKeys(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, oidc.options.JWKSURL, nil)
	response, err := oidc.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("jwks unavailable")
	}
	var document struct {
		Keys []struct{ Kid, Kty, N, E string } `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 256<<10)).Decode(&document); err != nil {
		return nil, err
	}
	keys := make(map[string]*rsa.PublicKey, len(document.Keys))
	for _, item := range document.Keys {
		if item.Kty != "RSA" {
			continue
		}
		nBytes, err := base64.RawURLEncoding.DecodeString(item.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(item.E)
		if err != nil || len(eBytes) > 4 {
			continue
		}
		var padded [4]byte
		copy(padded[4-len(eBytes):], eBytes)
		keys[item.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: int(binary.BigEndian.Uint32(padded[:]))}
	}
	return keys, nil
}

func (oidc *GoogleOIDC) sealFlow(flow googleFlow) (string, error) {
	plaintext, _ := json.Marshal(flow)
	nonce := make([]byte, oidc.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(append(nonce, oidc.aead.Seal(nil, nonce, plaintext, nil)...)), nil
}

func (oidc *GoogleOIDC) openFlow(value string) (googleFlow, error) {
	encoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(encoded) <= oidc.aead.NonceSize() {
		return googleFlow{}, ErrInvalidProof
	}
	nonce, ciphertext := encoded[:oidc.aead.NonceSize()], encoded[oidc.aead.NonceSize():]
	plaintext, err := oidc.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return googleFlow{}, ErrInvalidProof
	}
	var flow googleFlow
	if json.Unmarshal(plaintext, &flow) != nil {
		return googleFlow{}, ErrInvalidProof
	}
	return flow, nil
}

func subtleCompare(left, right string) bool {
	leftDigest, rightDigest := sha256.Sum256([]byte(left)), sha256.Sum256([]byte(right))
	return hmac.Equal(leftDigest[:], rightDigest[:])
}

func (service *Service) CompleteGoogleIdentity(ctx context.Context, claims GoogleClaims, device, userAgent, ipPrefix string) (GoogleAuthResult, error) {
	normalized, err := NormalizeEmail(claims.Email)
	if err != nil {
		return GoogleAuthResult{}, ErrInvalidProof
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return GoogleAuthResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	identity, err := queries.GetActiveGoogleIdentity(ctx, db.GetActiveGoogleIdentityParams{ProviderIssuer: pgtype.Text{String: claims.Issuer, Valid: true}, ProviderSubject: pgtype.Text{String: claims.Subject, Valid: true}})
	if err == nil {
		user, err := queries.GetUserByID(ctx, identity.UserID)
		if err != nil {
			return GoogleAuthResult{}, err
		}
		proof, err := service.createSession(ctx, queries, user.ID, "full", user.OnboardingStatus, device, userAgent, ipPrefix)
		if err != nil {
			return GoogleAuthResult{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return GoogleAuthResult{}, err
		}
		return GoogleAuthResult{Session: proof}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return GoogleAuthResult{}, err
	}
	emailIdentity, emailErr := queries.GetActiveEmailIdentity(ctx, pgtype.Text{String: normalized, Valid: true})
	if emailErr == nil {
		linkToken, _ := randomToken(32)
		_, err := queries.CreateSocialLinkAttempt(ctx, db.CreateSocialLinkAttemptParams{TargetUserID: emailIdentity.UserID, ProviderIssuer: claims.Issuer, ProviderSubject: claims.Subject, NormalizedEmail: normalized, ProofDigest: digest(linkToken), ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(10 * time.Minute), Valid: true}})
		if err != nil {
			return GoogleAuthResult{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return GoogleAuthResult{}, err
		}
		return GoogleAuthResult{RequiresLinkProof: true, LinkProofToken: linkToken}, nil
	}
	if !errors.Is(emailErr, pgx.ErrNoRows) {
		return GoogleAuthResult{}, emailErr
	}
	user, err := queries.CreateUser(ctx, db.CreateUserParams{DisplayName: pgtype.Text{String: claims.Name, Valid: claims.Name != ""}, Locale: "en-NG", Timezone: "Africa/Lagos"})
	if err != nil {
		return GoogleAuthResult{}, err
	}
	_, err = queries.CreateGoogleIdentity(ctx, db.CreateGoogleIdentityParams{UserID: user.ID, ProviderIssuer: pgtype.Text{String: claims.Issuer, Valid: true}, ProviderSubject: pgtype.Text{String: claims.Subject, Valid: true}, NormalizedIdentifier: pgtype.Text{String: normalized, Valid: true}, DisplayIdentifier: pgtype.Text{String: claims.Email, Valid: true}, VerifiedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}})
	if err != nil {
		return GoogleAuthResult{}, err
	}
	_, err = queries.CreateEmailIdentity(ctx, db.CreateEmailIdentityParams{UserID: user.ID, NormalizedIdentifier: pgtype.Text{String: normalized, Valid: true}, DisplayIdentifier: pgtype.Text{String: claims.Email, Valid: true}, VerifiedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}})
	if err != nil {
		return GoogleAuthResult{}, err
	}
	proof, err := service.createSession(ctx, queries, user.ID, "pre_auth", user.OnboardingStatus, device, userAgent, ipPrefix)
	if err != nil {
		return GoogleAuthResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return GoogleAuthResult{}, err
	}
	return GoogleAuthResult{Session: proof}, nil
}

func (service *Service) CompleteGoogleLinkWithPassword(ctx context.Context, linkToken, password, device, userAgent, ipPrefix string) (SessionProof, error) {
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SessionProof{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	attempt, err := queries.GetSocialLinkAttemptForUpdate(ctx, digest(linkToken))
	if err != nil || attempt.Status != "pending" || attempt.ExpiresAt.Time.Before(time.Now()) {
		return SessionProof{}, ErrInvalidProof
	}
	credential, err := queries.GetActivePasswordCredential(ctx, attempt.TargetUserID)
	if err != nil {
		return SessionProof{}, ErrInvalidCredentials
	}
	valid, _ := service.hasher.Verify(password, credential.EncodedHash)
	if !valid {
		return SessionProof{}, ErrInvalidCredentials
	}
	_, err = queries.CreateGoogleIdentity(ctx, db.CreateGoogleIdentityParams{UserID: attempt.TargetUserID, ProviderIssuer: pgtype.Text{String: attempt.ProviderIssuer, Valid: true}, ProviderSubject: pgtype.Text{String: attempt.ProviderSubject, Valid: true}, NormalizedIdentifier: pgtype.Text{String: attempt.NormalizedEmail, Valid: true}, DisplayIdentifier: pgtype.Text{String: attempt.NormalizedEmail, Valid: true}, VerifiedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}})
	if err != nil {
		return SessionProof{}, err
	}
	if _, err := queries.CompleteSocialLinkAttempt(ctx, attempt.ID); err != nil {
		return SessionProof{}, err
	}
	user, err := queries.GetUserByID(ctx, attempt.TargetUserID)
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

func (service *Service) DisconnectGoogle(ctx context.Context, rawSession, csrfToken string) error {
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
	otherMethods, err := queries.CountActiveNonGoogleLoginRecoveryMethods(ctx, session.UserID)
	if err != nil {
		return err
	}
	if otherMethods < 1 {
		return ErrFinalLoginMethod
	}
	unlinked, err := queries.UnlinkGoogleIdentities(ctx, session.UserID)
	if err != nil {
		return err
	}
	if unlinked == 0 {
		return ErrInvalidProof
	}
	return tx.Commit(ctx)
}
