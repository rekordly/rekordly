package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Environment  string
	DatabaseURL  string
	DigestSecret string
	SMTPHost     string
	SMTPPort     int
	SMTPFrom     string
	SMTPTLSMode  string
	AppBaseURL   string
	PollInterval time.Duration
}

func Load() (Config, error) {
	v := viper.New()
	v.SetDefault("ENVIRONMENT", "local")
	v.SetDefault("SMTP_PORT", 1025)
	v.SetDefault("SMTP_FROM", "Rekordly <no-reply@rekordly.local>")
	v.SetDefault("SMTP_TLS_MODE", "none")
	v.SetDefault("APP_BASE_URL", "http://localhost:3000")
	v.SetDefault("WORKER_POLL_INTERVAL", "5s")
	v.AutomaticEnv()
	cfg := Config{
		Environment:  v.GetString("ENVIRONMENT"),
		DatabaseURL:  v.GetString("DATABASE_URL"),
		DigestSecret: v.GetString("JWT_SIGNING_SECRET"),
		SMTPHost:     v.GetString("SMTP_HOST"),
		SMTPPort:     v.GetInt("SMTP_PORT"),
		SMTPFrom:     v.GetString("SMTP_FROM"),
		SMTPTLSMode:  v.GetString("SMTP_TLS_MODE"),
		AppBaseURL:   v.GetString("APP_BASE_URL"),
		PollInterval: v.GetDuration("WORKER_POLL_INTERVAL"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.DigestSecret == "" || cfg.SMTPHost == "" || cfg.SMTPFrom == "" {
		return Config{}, fmt.Errorf("JWT_SIGNING_SECRET, SMTP_HOST and SMTP_FROM are required")
	}
	if cfg.SMTPPort < 1 || cfg.SMTPPort > 65535 || cfg.PollInterval < time.Second {
		return Config{}, fmt.Errorf("SMTP_PORT or WORKER_POLL_INTERVAL is invalid")
	}
	if cfg.Environment == "production" && cfg.SMTPTLSMode != "mandatory" {
		return Config{}, fmt.Errorf("production SMTP_TLS_MODE must be mandatory")
	}
	return cfg, nil
}
