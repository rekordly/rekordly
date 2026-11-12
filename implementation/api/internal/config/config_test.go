package config

import (
	"testing"
)

func TestValidateProductionConfig(t *testing.T) {
	base := Config{
		Environment:        "production",
		JWTSigningSecret:   "0123456789abcdef0123456789abcdef",
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

	httpOrigin := base
	httpOrigin.CORSAllowedOrigins = []string{"http://localhost:3000"}
	if err := validateProductionConfig(httpOrigin); err == nil {
		t.Fatal("expected error for non-HTTPS CORS origin in production")
	}

	paidMissingPaystack := base
	paidMissingPaystack.CommercialMode = "live_paid"
	if err := validateProductionConfig(paidMissingPaystack); err == nil {
		t.Fatal("expected error when paid mode lacks Paystack secrets")
	}
}
