package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/auth"
	"github.com/rekordly/rekordly-api/internal/config"
	"github.com/rekordly/rekordly-api/internal/finance"
)

type ReadinessCheck func(context.Context) error

func NewRouter(cfg config.Config, logger *slog.Logger, readiness ReadinessCheck, authHandler *auth.Handler, financeHandlers ...*finance.Handler) http.Handler {
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowedOrigins,
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{"Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID", "X-CSRF-Token", "X-Preauth-Token", "X-Device-Label", "X-Workspace-ID"},
		ExposeHeaders:    []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/health/live", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"status": "ok"}})
	})
	router.GET("/health/ready", func(c *gin.Context) {
		if readiness == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "NOT_READY", "message": "Service is not ready"}})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), cfg.DatabaseHealthTimeout)
		defer cancel()
		if err := readiness(ctx); err != nil {
			logger.Warn("readiness check failed", "error", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "NOT_READY", "message": "Service is not ready"}})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"status": "ready"}})
	})

	v1 := router.Group("/api/v1")
	if authHandler != nil {
		authHandler.RegisterRoutes(v1)
	}
	for _, fh := range financeHandlers {
		if fh != nil {
			fh.RegisterRoutes(v1)
		}
	}
	v1.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"status": "ok"}})
	})

	logger.Info("http router configured", "allowed_origins", cfg.CORSAllowedOrigins)
	return router
}
