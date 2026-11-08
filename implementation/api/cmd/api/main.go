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

	"github.com/rekordly/rekordly-api/internal/auth"
	"github.com/rekordly/rekordly-api/internal/config"
	"github.com/rekordly/rekordly-api/internal/database"
	"github.com/rekordly/rekordly-api/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration is invalid", "error", err)
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

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.NewRouter(cfg, logger, pool.Ping, authHandler),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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
