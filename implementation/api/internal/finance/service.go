package finance

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInvalidRequest = errors.New("invalid finance request")
var ErrIdempotencyConflict = errors.New("idempotency key conflict")
var amountPattern = regexp.MustCompile(`^[0-9]+(?:\.[0-9]+)?$`)

type Service struct{ pool *pgxpool.Pool }

type DraftInput struct {
	Direction        string `json:"direction"`
	Amount           string `json:"amount"`
	Currency         string `json:"currency"`
	OccurredOn       string `json:"occurred_on"`
	AccountID        *int64 `json:"account_id"`
	CategoryID       *int64 `json:"category_id"`
	Purpose          string `json:"purpose"`
	CounterpartyName string `json:"counterparty_name"`
	Note             string `json:"note"`
	EntrySource      string `json:"entry_source"`
}

type Draft struct {
	ID               int64  `json:"id"`
	WorkspaceID      int64  `json:"workspace_id"`
	Direction        string `json:"direction"`
	AmountMinor      string `json:"amount_minor"`
	Currency         string `json:"currency"`
	OccurredOn       string `json:"occurred_on"`
	Purpose          string `json:"purpose"`
	CounterpartyName string `json:"counterparty_name,omitempty"`
	Note             string `json:"note,omitempty"`
	EntrySource      string `json:"entry_source"`
	Status           string `json:"status"`
	CreatedAt        string `json:"created_at"`
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

func digest(value string) []byte { sum := sha256.Sum256([]byte(value)); return sum[:] }

func minorUnits(raw string, exponent int) (int64, error) {
	raw = strings.TrimSpace(raw)
	if !amountPattern.MatchString(raw) || strings.HasPrefix(raw, "0.") && strings.Trim(raw[2:], "0") == "" {
		return 0, ErrInvalidRequest
	}
	parts := strings.SplitN(raw, ".", 2)
	whole, ok := new(big.Int).SetString(parts[0], 10)
	if !ok { return 0, ErrInvalidRequest }
	fraction := ""
	if len(parts) == 2 { fraction = parts[1] }
	if len(fraction) > exponent { return 0, ErrInvalidRequest }
	fraction += strings.Repeat("0", exponent-len(fraction))
	minor := new(big.Int).Mul(whole, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(exponent)), nil))
	if fraction != "" { f, ok := new(big.Int).SetString(fraction, 10); if !ok { return 0, ErrInvalidRequest }; minor.Add(minor, f) }
	if !minor.IsInt64() || minor.Sign() <= 0 { return 0, ErrInvalidRequest }
	return minor.Int64(), nil
}

func currencyExponent(currency string) int { if currency == "JPY" || currency == "XOF" { return 0 }; return 2 }

func validateInput(input DraftInput) (int64, time.Time, error) {
	input.Currency = strings.ToUpper(strings.TrimSpace(input.Currency))
	if input.Direction != "money_in" && input.Direction != "money_out" && input.Direction != "transfer" { return 0, time.Time{}, ErrInvalidRequest }
	if len(input.Currency) != 3 { return 0, time.Time{}, ErrInvalidRequest }
	amount, err := minorUnits(input.Amount, currencyExponent(input.Currency)); if err != nil { return 0, time.Time{}, err }
	date, err := time.Parse("2006-01-02", input.OccurredOn); if err != nil { return 0, time.Time{}, ErrInvalidRequest }
	return amount, date, nil
}

func (service *Service) CreateDraft(ctx context.Context, userID, workspaceID int64, idempotencyKey string, input DraftInput) (Draft, error) {
	amount, occurredOn, err := validateInput(input); if err != nil { return Draft{}, err }
	if len(strings.TrimSpace(idempotencyKey)) < 8 || len(idempotencyKey) > 120 { return Draft{}, ErrInvalidRequest }
	input.Currency = strings.ToUpper(strings.TrimSpace(input.Currency))
	input.Purpose = strings.TrimSpace(input.Purpose); if input.Purpose == "" { input.Purpose = "not_yet_known" }
	input.EntrySource = strings.TrimSpace(input.EntrySource); if input.EntrySource == "" { input.EntrySource = "manual" }
	if input.EntrySource != "manual" && input.EntrySource != "ai_assisted" && input.EntrySource != "import" && input.EntrySource != "offline" { return Draft{}, ErrInvalidRequest }
	fingerprintInput, _ := json.Marshal(input)
	fingerprint := sha256.Sum256(fingerprintInput)
	var result Draft
	var created time.Time
	err = service.pool.QueryRow(ctx, `
		INSERT INTO money_records (workspace_id, actor_user_id, direction, amount_minor, currency, occurred_on, account_id, category_id, purpose, counterparty_name, note, entry_source, idempotency_key, idempotency_fingerprint)
		SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),NULLIF($11,''),$12,$13,$14
		WHERE EXISTS (SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND status='active')
		  AND ($7::bigint IS NULL OR EXISTS (SELECT 1 FROM finance_accounts WHERE id=$7 AND workspace_id=$1 AND status='active'))
		  AND ($8::bigint IS NULL OR EXISTS (SELECT 1 FROM finance_categories WHERE id=$8 AND workspace_id=$1 AND status='active'))
		ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
		RETURNING id, workspace_id, direction, amount_minor::text, currency, occurred_on::text, purpose, COALESCE(counterparty_name,''), COALESCE(note,''), entry_source, status, created_at`,
		workspaceID, userID, input.Direction, amount, input.Currency, occurredOn, input.AccountID, input.CategoryID, input.Purpose, strings.TrimSpace(input.CounterpartyName), strings.TrimSpace(input.Note), input.EntrySource, idempotencyKey, fingerprint[:]).
		Scan(&result.ID, &result.WorkspaceID, &result.Direction, &result.AmountMinor, &result.Currency, &result.OccurredOn, &result.Purpose, &result.CounterpartyName, &result.Note, &result.EntrySource, &result.Status, &created)
	if errors.Is(err, pgx.ErrNoRows) {
		var existingFingerprint []byte
		err = service.pool.QueryRow(ctx, `SELECT id, workspace_id, direction, amount_minor::text, currency, occurred_on::text, purpose, COALESCE(counterparty_name,''), COALESCE(note,''), entry_source, status, created_at, idempotency_fingerprint FROM money_records WHERE workspace_id=$1 AND idempotency_key=$2`, workspaceID, idempotencyKey).Scan(&result.ID, &result.WorkspaceID, &result.Direction, &result.AmountMinor, &result.Currency, &result.OccurredOn, &result.Purpose, &result.CounterpartyName, &result.Note, &result.EntrySource, &result.Status, &created, &existingFingerprint)
		if err == nil { if !bytes.Equal(existingFingerprint, fingerprint[:]) { return Draft{}, ErrIdempotencyConflict }; result.CreatedAt = created.UTC().Format(time.RFC3339); return result, nil }
		return Draft{}, ErrInvalidRequest
	}
	if err != nil { return Draft{}, err }
	result.CreatedAt = created.UTC().Format(time.RFC3339)
	return result, nil
}
