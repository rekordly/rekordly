package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

func TestGoogleIDTokenValidation(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	kid := "test-key"
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		exponent := make([]byte, 4)
		binary.BigEndian.PutUint32(exponent, uint32(privateKey.PublicKey.E))
		exponent = exponent[1:]
		_ = json.NewEncoder(response).Encode(map[string]any{"keys": []map[string]string{{
			"kid": kid, "kty": "RSA", "n": base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(exponent),
		}}})
	}))
	defer server.Close()
	oidc, err := NewGoogleOIDC(GoogleOptions{ClientID: "client-id", Issuer: "https://accounts.example", JWKSURL: server.URL, FlowSecret: "test-flow-secret"})
	require.NoError(t, err)

	sign := func(claims GoogleClaims, key *rsa.PrivateKey) string {
		token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		token.Header["kid"] = kid
		raw, signErr := token.SignedString(key)
		require.NoError(t, signErr)
		return raw
	}
	validClaims := GoogleClaims{
		Email: "person@example.test", EmailVerified: true, Nonce: "expected-nonce",
		RegisteredClaims: jwt.RegisteredClaims{Issuer: "https://accounts.example", Subject: "google-subject", Audience: jwt.ClaimStrings{"client-id"}, ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)), IssuedAt: jwt.NewNumericDate(time.Now())},
	}
	_, err = oidc.validateIDToken(context.Background(), sign(validClaims, privateKey), "expected-nonce")
	require.NoError(t, err)

	tests := []struct {
		name   string
		mutate func(*GoogleClaims)
		key    *rsa.PrivateKey
	}{
		{name: "issuer", mutate: func(value *GoogleClaims) { value.Issuer = "https://attacker.example" }},
		{name: "audience", mutate: func(value *GoogleClaims) { value.Audience = jwt.ClaimStrings{"other-client"} }},
		{name: "nonce", mutate: func(value *GoogleClaims) { value.Nonce = "wrong-nonce" }},
		{name: "expiry", mutate: func(value *GoogleClaims) { value.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute)) }},
		{name: "unverified email", mutate: func(value *GoogleClaims) { value.EmailVerified = false }},
		{name: "signature", mutate: func(*GoogleClaims) {}, key: mustRSAKey(t)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			claims := validClaims
			test.mutate(&claims)
			key := test.key
			if key == nil {
				key = privateKey
			}
			_, validationErr := oidc.validateIDToken(context.Background(), sign(claims, key), "expected-nonce")
			require.ErrorIs(t, validationErr, ErrInvalidProof)
		})
	}
}

func mustRSAKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return key
}

func TestGoogleFlowCookieIsEncryptedAndTamperEvident(t *testing.T) {
	oidc, err := NewGoogleOIDC(GoogleOptions{FlowSecret: "flow-secret"})
	require.NoError(t, err)
	flow := googleFlow{State: "state", Nonce: "nonce", Verifier: "verifier", ExpiresAt: time.Now().Add(time.Minute).Unix()}
	sealed, err := oidc.sealFlow(flow)
	require.NoError(t, err)
	require.NotContains(t, sealed, "verifier")
	opened, err := oidc.openFlow(sealed)
	require.NoError(t, err)
	require.Equal(t, flow, opened)
	decoded, _ := base64.RawURLEncoding.DecodeString(sealed)
	decoded[len(decoded)-1] ^= 1
	_, err = oidc.openFlow(base64.RawURLEncoding.EncodeToString(decoded))
	require.ErrorIs(t, err, ErrInvalidProof)
}
