package config

import (
	"testing"

	"github.com/rekordly/rekordly-api/internal/crypto"
)

func TestValidateProductionConfig(t *testing.T) {
	base := Config{
		Environment:        "production",
		JWTSigningSecret:   "0123456789abcdef0123456789abcdef",
		DataEncryptionKey:  "fedcba9876543210fedcba9876543210",
		FrontendBaseURL:    "https://app.rekordly.com",
		CORSAllowedOrigins: []string{"https://app.rekordly.com"},
		ResendAPIKey:       "re_test",
		EmailWebhookSecret: "whsec_test",
		CommercialMode:     "controlled_beta",
	}
	if err := validateProductionConfig(base); err != nil {
		t.Fatalf("expected valid production config, got %v", err)
	}

	shortSecret := base
	shortSecret.JWTSigningSecret = "too-short"
	if err := validateProductionConfig(shortSecret); err == nil {
		t.Fatal("expected error for short JWT_SIGNING_SECRET in production")
	}

	missingEncKey := base
	missingEncKey.DataEncryptionKey = ""
	if err := validateProductionConfig(missingEncKey); err == nil {
		t.Fatal("expected error when DATA_ENCRYPTION_KEY is missing in production")
	}

	shortEncKey := base
	shortEncKey.DataEncryptionKey = "short-key"
	if err := validateProductionConfig(shortEncKey); err == nil {
		t.Fatal("expected error when DATA_ENCRYPTION_KEY is shorter than 32 bytes")
	}

	reusedJWTKey := base
	reusedJWTKey.DataEncryptionKey = base.JWTSigningSecret
	if err := validateProductionConfig(reusedJWTKey); err == nil {
		t.Fatal("expected error when DATA_ENCRYPTION_KEY equals JWT_SIGNING_SECRET")
	}

	httpOrigin := base
	httpOrigin.CORSAllowedOrigins = []string{"http://localhost:3000"}
	if err := validateProductionConfig(httpOrigin); err == nil {
		t.Fatal("expected error for non-HTTPS CORS origin in production")
	}

	paidMissingPaystack := base
	paidMissingPaystack.CommercialMode = "live_paid"
	if err := validateProductionConfig(paidMissingPaystack); err == nil {
		t.Fatal("expected error when paid mode lacks PAYSTACK_SECRET_KEY")
	}

	paidOnlySecretKey := base
	paidOnlySecretKey.CommercialMode = "live_paid"
	paidOnlySecretKey.PaystackSecretKey = "sk_live_test"
	if err := validateProductionConfig(paidOnlySecretKey); err != nil {
		t.Fatalf("expected paid mode with only PAYSTACK_SECRET_KEY to be valid, got %v", err)
	}
}

func TestDataEncryptionKeyStartupPolicyAcrossEnvironments(t *testing.T) {
	jwtSecret := "jwt-secret-0123456789abcdef0123456789"
	validEncKey := "enc-secret-fedcba9876543210fedcba98765"

	// 1. Local environment with empty DATA_ENCRYPTION_KEY uses explicit local-dev default
	resolvedLocal, err := validateAndResolveDataEncryptionKey("local", "", jwtSecret)
	if err != nil {
		t.Fatalf("expected local default key to succeed, got %v", err)
	}
	if resolvedLocal != crypto.LocalDevDefaultKey {
		t.Fatalf("expected LocalDevDefaultKey, got %q", resolvedLocal)
	}

	// 2. Local environment rejects short custom DATA_ENCRYPTION_KEY or reuse of JWT_SIGNING_SECRET
	if _, err := validateAndResolveDataEncryptionKey("local", "too-short", jwtSecret); err == nil {
		t.Fatal("expected local to reject short explicit DATA_ENCRYPTION_KEY")
	}
	if _, err := validateAndResolveDataEncryptionKey("local", jwtSecret, jwtSecret); err == nil {
		t.Fatal("expected local to reject DATA_ENCRYPTION_KEY == JWT_SIGNING_SECRET")
	}

	// 3. Non-local environments (staging, test, production) refuse to start without >=32-byte DATA_ENCRYPTION_KEY
	for _, env := range []string{"production", "staging", "test", "preview"} {
		if _, err := validateAndResolveDataEncryptionKey(env, "", jwtSecret); err == nil {
			t.Fatalf("expected %s to refuse startup when DATA_ENCRYPTION_KEY is empty", env)
		}
		if _, err := validateAndResolveDataEncryptionKey(env, "short-12345", jwtSecret); err == nil {
			t.Fatalf("expected %s to refuse startup when DATA_ENCRYPTION_KEY < 32 bytes", env)
		}
		if _, err := validateAndResolveDataEncryptionKey(env, jwtSecret, jwtSecret); err == nil {
			t.Fatalf("expected %s to refuse startup when DATA_ENCRYPTION_KEY reuses JWT_SIGNING_SECRET", env)
		}
		got, err := validateAndResolveDataEncryptionKey(env, validEncKey, jwtSecret)
		if err != nil || got != validEncKey {
			t.Fatalf("expected %s with valid 32+ byte DATA_ENCRYPTION_KEY to succeed, got %q err=%v", env, got, err)
		}
	}
}
