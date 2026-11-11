package config

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Environment            string
	Port                   string
	DatabaseURL            string
	JWTSigningSecret       string
	CORSAllowedOrigins     []string
	DatabaseMaxConns       int32
	DatabaseMinConns       int32
	DatabaseConnectTimeout time.Duration
	DatabaseHealthTimeout  time.Duration
	SessionTTL             time.Duration
	GoogleClientID         string
	GoogleClientSecret     string
	GoogleRedirectURL      string
	GoogleAuthorizationURL string
	GoogleTokenURL         string
	GoogleJWKSURL          string
	GoogleIssuer           string
	FrontendBaseURL        string
	CloudinaryCloudName    string
	CloudinaryAPIKey       string
	CloudinaryAPISecret    string
}

func Load() (Config, error) {
	v := viper.New()
	v.SetDefault("ENVIRONMENT", "local")
	v.SetDefault("PORT", "8080")
	v.SetDefault("DATABASE_MAX_CONNS", 10)
	v.SetDefault("DATABASE_MIN_CONNS", 1)
	v.SetDefault("DATABASE_CONNECT_TIMEOUT", "5s")
	v.SetDefault("DATABASE_HEALTH_TIMEOUT", "2s")
	v.SetDefault("SESSION_TTL", "24h")
	v.SetDefault("GOOGLE_AUTHORIZATION_URL", "https://accounts.google.com/o/oauth2/v2/auth")
	v.SetDefault("GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token")
	v.SetDefault("GOOGLE_JWKS_URL", "https://www.googleapis.com/oauth2/v3/certs")
	v.SetDefault("GOOGLE_ISSUER", "https://accounts.google.com")
	v.SetDefault("FRONTEND_BASE_URL", "http://localhost:3000")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	cfg := Config{
		Environment:            v.GetString("ENVIRONMENT"),
		Port:                   v.GetString("PORT"),
		DatabaseURL:            v.GetString("DATABASE_URL"),
		JWTSigningSecret:       v.GetString("JWT_SIGNING_SECRET"),
		CORSAllowedOrigins:     splitAndTrim(v.GetString("CORS_ALLOWED_ORIGINS")),
		DatabaseMaxConns:       int32(v.GetInt("DATABASE_MAX_CONNS")),
		DatabaseMinConns:       int32(v.GetInt("DATABASE_MIN_CONNS")),
		DatabaseConnectTimeout: v.GetDuration("DATABASE_CONNECT_TIMEOUT"),
		DatabaseHealthTimeout:  v.GetDuration("DATABASE_HEALTH_TIMEOUT"),
		SessionTTL:             v.GetDuration("SESSION_TTL"),
		GoogleClientID:         v.GetString("GOOGLE_CLIENT_ID"),
		GoogleClientSecret:     v.GetString("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURL:      v.GetString("GOOGLE_REDIRECT_URL"),
		GoogleAuthorizationURL: v.GetString("GOOGLE_AUTHORIZATION_URL"),
		GoogleTokenURL:         v.GetString("GOOGLE_TOKEN_URL"),
		GoogleJWKSURL:          v.GetString("GOOGLE_JWKS_URL"),
		GoogleIssuer:           v.GetString("GOOGLE_ISSUER"),
		FrontendBaseURL:        v.GetString("FRONTEND_BASE_URL"),
		CloudinaryCloudName:    v.GetString("CLOUDINARY_CLOUD_NAME"),
		CloudinaryAPIKey:       v.GetString("CLOUDINARY_API_KEY"),
		CloudinaryAPISecret:    v.GetString("CLOUDINARY_API_SECRET"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSigningSecret == "" {
		return Config{}, fmt.Errorf("JWT_SIGNING_SECRET is required")
	}
	if len(cfg.CORSAllowedOrigins) == 0 {
		return Config{}, fmt.Errorf("CORS_ALLOWED_ORIGINS is required")
	}
	if cfg.DatabaseMaxConns < 1 || cfg.DatabaseMaxConns > 50 {
		return Config{}, fmt.Errorf("DATABASE_MAX_CONNS must be between 1 and 50")
	}
	if cfg.DatabaseMinConns < 0 || cfg.DatabaseMinConns > cfg.DatabaseMaxConns {
		return Config{}, fmt.Errorf("DATABASE_MIN_CONNS must be between 0 and DATABASE_MAX_CONNS")
	}
	if cfg.DatabaseConnectTimeout <= 0 || cfg.DatabaseHealthTimeout <= 0 {
		return Config{}, fmt.Errorf("database timeouts must be positive")
	}
	if cfg.SessionTTL < time.Hour || cfg.SessionTTL > 30*24*time.Hour {
		return Config{}, fmt.Errorf("SESSION_TTL must be between 1h and 720h")
	}
	googleValues := []string{cfg.GoogleClientID, cfg.GoogleClientSecret, cfg.GoogleRedirectURL}
	configured := 0
	for _, value := range googleValues {
		if value != "" {
			configured++
		}
	}
	if configured != 0 && configured != len(googleValues) {
		return Config{}, fmt.Errorf("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URL must be configured together")
	}
	cloudinaryValues := []string{cfg.CloudinaryCloudName, cfg.CloudinaryAPIKey, cfg.CloudinaryAPISecret}
	cloudinaryConfigured := 0
	for _, value := range cloudinaryValues {
		if value != "" {
			cloudinaryConfigured++
		}
	}
	if cloudinaryConfigured != 0 && cloudinaryConfigured != len(cloudinaryValues) {
		return Config{}, fmt.Errorf("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be configured together")
	}
	if err := validateDatabaseEnvironment(cfg.Environment, cfg.DatabaseURL); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func validateDatabaseEnvironment(environment, databaseURL string) error {
	if environment != "local" && environment != "test" {
		return nil
	}

	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return fmt.Errorf("DATABASE_URL is invalid: %w", err)
	}
	host := strings.ToLower(parsed.Hostname())
	allowed := map[string]struct{}{
		"localhost":            {},
		"127.0.0.1":            {},
		"::1":                  {},
		"rekordly-postgres":    {},
		"host.docker.internal": {},
	}
	if _, ok := allowed[host]; !ok {
		return fmt.Errorf("local/test DATABASE_URL host %q is not an approved local database host", host)
	}
	return nil
}

func splitAndTrim(value string) []string {
	var result []string
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}
