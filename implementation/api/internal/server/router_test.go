package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/config"
	"github.com/stretchr/testify/require"
)

func TestHealth(t *testing.T) {
	router := NewRouter(config.Config{
		Environment:        "test",
		CORSAllowedOrigins: []string{"http://localhost:3000"},
	}, slog.New(slog.NewTextHandler(io.Discard, nil)), func(context.Context) error { return nil }, nil)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.JSONEq(t, `{"data":{"status":"ok"}}`, response.Body.String())
}

func TestLiveness(t *testing.T) {
	router := NewRouter(config.Config{
		Environment:           "test",
		CORSAllowedOrigins:    []string{"http://localhost:3000"},
		DatabaseHealthTimeout: time.Second,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)), func(context.Context) error { return nil }, nil)

	request := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.JSONEq(t, `{"data":{"status":"ok"}}`, response.Body.String())
}

func TestReadinessFailsWithoutChecker(t *testing.T) {
	router := NewRouter(config.Config{
		Environment:           "test",
		CORSAllowedOrigins:    []string{"http://localhost:3000"},
		DatabaseHealthTimeout: time.Second,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil)

	request := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusServiceUnavailable, response.Code)
	require.JSONEq(t, `{"error":{"code":"NOT_READY","message":"Service is not ready"}}`, response.Body.String())
}
