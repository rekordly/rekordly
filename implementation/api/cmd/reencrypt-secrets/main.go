package main

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/rekordly/rekordly-api/internal/config"
	"github.com/rekordly/rekordly-api/internal/crypto"
	"github.com/rekordly/rekordly-api/internal/database"
	"github.com/rekordly/rekordly-api/internal/finance"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration is invalid", "error", err)
		os.Exit(1)
	}
	oldKey := strings.TrimSpace(os.Getenv("OLD_DATA_ENCRYPTION_KEY"))
	if oldKey == "" {
		oldKey = crypto.LegacyDefaultKey
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := database.Open(ctx, cfg)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	count, err := finance.ReencryptSecrets(ctx, pool, oldKey, cfg.DataEncryptionKey)
	if err != nil {
		logger.Error("re-encryption failed", "error", err)
		os.Exit(1)
	}
	logger.Info("re-encrypted secret rows", "updated_rows", count)
}
