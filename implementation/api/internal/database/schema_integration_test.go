package database_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func integrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for schema integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect to integration database: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("ping integration database: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func createTestUser(t *testing.T, pool *pgxpool.Pool) int64 {
	t.Helper()
	var userID int64
	err := pool.QueryRow(context.Background(), `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, "schema-test").Scan(&userID)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM workspaces WHERE owner_user_id = $1`, userID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	})
	return userID
}

func requireOneUniqueViolation(t *testing.T, errs []error) {
	t.Helper()
	var successes, uniqueViolations int
	for _, err := range errs {
		if err == nil {
			successes++
			continue
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			uniqueViolations++
			continue
		}
		t.Fatalf("unexpected concurrent insert error: %v", err)
	}
	if successes != 1 || uniqueViolations != 1 {
		t.Fatalf("expected one success and one unique violation, got successes=%d unique_violations=%d", successes, uniqueViolations)
	}
}

func concurrentExec(pool *pgxpool.Pool, statement string, args ...any) []error {
	errs := make([]error, 2)
	start := make(chan struct{})
	var wait sync.WaitGroup
	for index := range errs {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			_, errs[index] = pool.Exec(context.Background(), statement, args...)
		}(index)
	}
	close(start)
	wait.Wait()
	return errs
}

func TestEmailIdentityUniquenessUnderConcurrency(t *testing.T) {
	pool := integrationPool(t)
	firstUserID := createTestUser(t, pool)
	secondUserID := createTestUser(t, pool)
	email := fmt.Sprintf("schema-%d@example.test", time.Now().UnixNano())
	errs := make([]error, 2)
	start := make(chan struct{})
	var wait sync.WaitGroup
	for index, userID := range []int64{firstUserID, secondUserID} {
		wait.Add(1)
		go func(index int, userID int64) {
			defer wait.Done()
			<-start
			_, errs[index] = pool.Exec(context.Background(), `
				INSERT INTO auth_identities (user_id, provider, normalized_identifier, verified_at)
				VALUES ($1, 'email', $2, now())`, userID, email)
		}(index, userID)
	}
	close(start)
	wait.Wait()
	requireOneUniqueViolation(t, errs)
}

func TestGoogleSubjectUniquenessUnderConcurrency(t *testing.T) {
	pool := integrationPool(t)
	firstUserID := createTestUser(t, pool)
	secondUserID := createTestUser(t, pool)
	subject := fmt.Sprintf("google-subject-%d", time.Now().UnixNano())
	errs := make([]error, 2)
	start := make(chan struct{})
	var wait sync.WaitGroup
	for index, userID := range []int64{firstUserID, secondUserID} {
		wait.Add(1)
		go func(index int, userID int64) {
			defer wait.Done()
			<-start
			_, errs[index] = pool.Exec(context.Background(), `
				INSERT INTO auth_identities (user_id, provider, provider_issuer, provider_subject, verified_at)
				VALUES ($1, 'google', 'https://accounts.google.com', $2, now())`, userID, subject)
		}(index, userID)
	}
	close(start)
	wait.Wait()
	requireOneUniqueViolation(t, errs)
}

func TestPersonalWorkspaceUniquenessUnderConcurrency(t *testing.T) {
	pool := integrationPool(t)
	userID := createTestUser(t, pool)
	suffix := time.Now().UnixNano()
	errs := make([]error, 2)
	start := make(chan struct{})
	var wait sync.WaitGroup
	for index := range errs {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			_, errs[index] = pool.Exec(context.Background(), `
				INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id)
				VALUES ('personal', 'Personal', $1, 'NGN', $2)`, fmt.Sprintf("schema-%d-%d", suffix, index), userID)
		}(index)
	}
	close(start)
	wait.Wait()
	requireOneUniqueViolation(t, errs)
}

func TestCredentialTablesContainNoPlaintextSecretColumns(t *testing.T) {
	pool := integrationPool(t)
	rows, err := pool.Query(context.Background(), `
		SELECT table_name, column_name
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name = ANY($1::text[])
		  AND column_name = ANY($2::text[])
	`, []string{"password_credentials", "otp_challenges", "magic_link_challenges", "oauth_login_attempts", "sessions", "invitations"}, []string{"password", "password_hash", "code", "token", "refresh_token", "state", "nonce", "pkce_verifier"})
	if err != nil {
		t.Fatalf("inspect credential columns: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var tableName, columnName string
		if err := rows.Scan(&tableName, &columnName); err != nil {
			t.Fatalf("scan credential column: %v", err)
		}
		t.Errorf("plaintext-capable secret column found: %s.%s", tableName, columnName)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate credential columns: %v", err)
	}
}
