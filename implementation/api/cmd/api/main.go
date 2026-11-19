package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rekordly/rekordly-api/internal/ai"
	"github.com/rekordly/rekordly-api/internal/auth"
	"github.com/rekordly/rekordly-api/internal/billing"
	"github.com/rekordly/rekordly-api/internal/config"
	"github.com/rekordly/rekordly-api/internal/crypto"
	"github.com/rekordly/rekordly-api/internal/database"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/rekordly/rekordly-api/internal/notify"
	"github.com/rekordly/rekordly-api/internal/payments"
	"github.com/rekordly/rekordly-api/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration is invalid", "error", err)
		os.Exit(1)
	}
	if err := crypto.SetKey(cfg.DataEncryptionKey); err != nil {
		logger.Error("data encryption key is invalid", "error", err)
		os.Exit(1)
	}

	startupCtx, startupCancel := context.WithTimeout(context.Background(), cfg.DatabaseConnectTimeout)
	pool, err := database.Open(startupCtx, cfg)
	startupCancel()
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	authService, err := auth.NewService(pool, cfg.JWTSigningSecret, cfg.SessionTTL)
	if err != nil {
		logger.Error("authentication service initialization failed", "error", err)
		os.Exit(1)
	}
	googleOIDC, err := auth.NewGoogleOIDC(auth.GoogleOptions{
		ClientID: cfg.GoogleClientID, ClientSecret: cfg.GoogleClientSecret, RedirectURL: cfg.GoogleRedirectURL,
		AuthorizationURL: cfg.GoogleAuthorizationURL, TokenURL: cfg.GoogleTokenURL, JWKSURL: cfg.GoogleJWKSURL,
		Issuer: cfg.GoogleIssuer, FlowSecret: cfg.JWTSigningSecret,
	})
	if err != nil {
		logger.Error("google oidc initialization failed", "error", err)
		os.Exit(1)
	}
	authHandler := auth.NewHandler(authService, googleOIDC, cfg.Environment == "production")
	aiTimeout := time.Duration(cfg.AITimeoutSeconds) * time.Second
	if aiTimeout <= 0 {
		aiTimeout = 45 * time.Second
	}
	geminiProvider := ai.NewGeminiProvider(cfg.GeminiAPIKey, cfg.GeminiModel, aiTimeout)
	deepseekProvider := ai.NewDeepSeekProvider(cfg.DeepSeekAPIKey, cfg.DeepSeekModel, aiTimeout)
	var primaryAI, fallbackAI ai.MoneyDraftProvider = geminiProvider, deepseekProvider
	if cfg.AIDefaultProvider == "deepseek" {
		primaryAI, fallbackAI = deepseekProvider, geminiProvider
	}
	aiOrch := ai.NewOrchestrator(primaryAI, fallbackAI, aiTimeout, cfg.AIMaxInputChars, cfg.AIMaxOutputTokens)

	paystack := billing.NewPaystackProvider(cfg.PaystackSecretKey, cfg.PaystackWebhookSecret, cfg.PaystackBaseURL, 15*time.Second)
	resend := notify.NewResendEmailProvider(cfg.ResendAPIKey, cfg.ResendBaseURL, cfg.EmailFrom, cfg.EmailWebhookSecret, 15*time.Second)

	serviceOpts := []finance.ServiceOption{
		finance.WithCloudinaryEvidence(finance.CloudinaryEvidenceConfig{
			CloudName: cfg.CloudinaryCloudName,
			APIKey:    cfg.CloudinaryAPIKey,
			APISecret: cfg.CloudinaryAPISecret,
		}),
		finance.WithAIOrchestrator(aiOrch),
		finance.WithPaymentProvider(paystack),
		finance.WithEmailProvider(resend, cfg.GuestShareBaseURL),
		finance.WithPlatformCommissionPercent(cfg.PlatformCommissionPercent),
		finance.WithDataEncryptionKey(cfg.DataEncryptionKey),
		finance.WithPublicAPIBaseURL(cfg.PublicAPIBaseURL),
	}
	if cfg.PaystackSecretKey != "" {
		serviceOpts = append(serviceOpts, finance.WithStorefrontPaymentProvider(
			payments.NewPaystackProvider(cfg.PaystackSecretKey, cfg.PaystackWebhookSecret, cfg.PaystackBaseURL, 15*time.Second),
		))
	}
	if cfg.SquadSecretKey != "" {
		serviceOpts = append(serviceOpts, finance.WithStorefrontPaymentProvider(
			payments.NewSquadProvider(cfg.SquadSecretKey, cfg.SquadWebhookSecret, cfg.SquadBaseURL, 15*time.Second, payments.WithSquadDynamicVA(cfg.SquadDynamicVAEnabled)),
		))
	}

	financeService := finance.NewService(pool, serviceOpts...)
	financeAuthMiddleware := finance.AuthAndWorkspaceMiddleware(pool, authService)
	financeHandler := finance.NewHandler(financeService, financeAuthMiddleware)

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.NewRouter(cfg, logger, pool.Ping, authHandler, financeHandler),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      aiTimeout + 15*time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-shutdownCtx.Done():
				return
			case <-ticker.C:
				sweepCtx, cancel := context.WithTimeout(shutdownCtx, 30*time.Second)
				if n, err := financeService.ExpireStaleStorefrontReservations(sweepCtx); err != nil {
					logger.Warn("storefront reservation expiry sweep failed", "error", err)
				} else if n > 0 {
					logger.Info("expired stale storefront reservations", "count", n)
				}
				cancel()
			}
		}
	}()

	go func() {
		<-shutdownCtx.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(ctx); err != nil {
			logger.Error("http server shutdown failed", "error", err)
		}
	}()

	logger.Info("api listening", "port", cfg.Port, "environment", cfg.Environment)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("http server failed", "error", err)
		os.Exit(1)
	}
}
