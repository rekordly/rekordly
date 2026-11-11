package finance

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrDraftVersionConflict    = errors.New("draft has changed; reload before saving")
	ErrDraftNotEditable        = errors.New("draft is no longer editable")
	ErrDraftNotOwned           = errors.New("draft does not belong to current user")
	ErrDraftNotConfirmable     = errors.New("draft cannot be confirmed")
	ErrPurposeNotAllowed       = errors.New("purpose is not allowed for this workspace")
	ErrAllocationRequired      = errors.New("this purpose requires payment allocation, which is handled by the allocation workflow")
	ErrMixedRuleNotConfigured  = errors.New("mixed-record posting is not enabled until owner due-to/from rules are configured")
	ErrIdempotencyRequired     = errors.New("Idempotency-Key is required")
	ErrIdempotencyConflict     = errors.New("idempotency key was reused with a different command")
	ErrFutureDatedConfirmation = errors.New("future-dated records must remain drafts until their effective date")
	ErrAccountInactive         = errors.New("money account is inactive")
	ErrAccountCurrencyMismatch = errors.New("account currency does not match record currency")
	ErrInvalidDraftPayload     = errors.New("draft payload must be a bounded JSON object")
	ErrInvalidDraftTags        = errors.New("draft tags must be a bounded JSON array")
	ErrCrossWorkspaceScope     = errors.New("record scope does not match the active workspace")
)

const (
	maxDraftJSONBytes = 32 * 1024
	maxTagsJSONBytes  = 4 * 1024
)

type MoneyRecordDraftInput struct {
	EntryMethod          string          `json:"entry_method"`
	Direction            string          `json:"direction" binding:"required"`
	ScopeType            string          `json:"scope_type" binding:"required"`
	Purpose              string          `json:"purpose"`
	Amount               string          `json:"amount"`
	AmountMinor          string          `json:"amount_minor"`
	Currency             string          `json:"currency"`
	EffectiveDate        string          `json:"effective_date" binding:"required"`
	MoneyAccountID       *int64          `json:"money_account_id"`
	DestinationAccountID *int64          `json:"destination_account_id"`
	CategoryID           *int64          `json:"category_id"`
	CounterpartyID       *int64          `json:"counterparty_id"`
	CounterpartyName     string          `json:"counterparty_name"`
	Description          string          `json:"description"`
	Reference            string          `json:"reference"`
	Tags                 json.RawMessage `json:"tags"`
	Payload              json.RawMessage `json:"payload"`
	AIMetadata           json.RawMessage `json:"ai_metadata"`
	ClientCommandID      string          `json:"client_command_id"`
}

type UpdateMoneyRecordDraftInput struct {
	MoneyRecordDraftInput
	ExpectedVersion int32 `json:"expected_version" binding:"required"`
}

type ConfirmMoneyRecordInput struct {
	DraftID         int64 `json:"draft_id" binding:"required"`
	ExpectedVersion int32 `json:"expected_version" binding:"required"`
}

type MoneyRecordDraftLinkInput struct {
	LinkType             string          `json:"link_type" binding:"required"`
	LinkedRecordID       int64           `json:"linked_record_id" binding:"required"`
	AllocatedAmountMinor string          `json:"allocated_amount_minor"`
	Metadata             json.RawMessage `json:"metadata"`
}

type MoneyRecordPreview struct {
	DraftID           string   `json:"draft_id"`
	Version           int32    `json:"version"`
	CanConfirm        bool     `json:"can_confirm"`
	BalanceEffect     string   `json:"balance_effect"`
	AccountingEffects []string `json:"accounting_effects"`
	Warnings          []string `json:"warnings"`
}

type MoneyRecordConfirmation struct {
	Draft        db.MoneyRecordDraft `json:"draft"`
	Record       db.MoneyRecord      `json:"record"`
	Transaction  db.MoneyTransaction `json:"transaction"`
	LedgerEntry  db.LedgerEntry      `json:"ledger_entry"`
	LedgerLines  []db.LedgerLine     `json:"ledger_lines"`
	Evidence     []db.EvidenceAsset  `json:"evidence"`
	WasDuplicate bool                `json:"was_duplicate"`
}

type MoneyRecordDetail struct {
	Record      db.MoneyRecord       `json:"record"`
	Parts       []db.MoneyRecordPart `json:"parts"`
	Links       []db.MoneyRecordLink `json:"links"`
	Evidence    []db.EvidenceAsset   `json:"evidence"`
	Transaction db.MoneyTransaction  `json:"transaction"`
}

// MoneyRecordDraftDetail is the editable draft plus its already-authorized
// supporting data. It deliberately contains evidence metadata only, never a
// provider delivery URL or upload credential.
type MoneyRecordDraftDetail struct {
	Draft    db.MoneyRecordDraft       `json:"draft"`
	Links    []db.MoneyRecordDraftLink `json:"links"`
	Evidence []db.EvidenceAsset        `json:"evidence"`
}

func (s *Service) CreateMoneyRecordDraft(ctx context.Context, workspaceID, userID int64, workspaceKind string, in MoneyRecordDraftInput) (db.MoneyRecordDraft, error) {
	normalized, state, err := s.normalizeMoneyRecordDraft(ctx, s.queries, workspaceID, workspaceKind, in, false)
	if err != nil {
		return db.MoneyRecordDraft{}, err
	}

	// Offline clients retain this ID across every reconnect attempt. Resolve a
	// prior result before inserting so a lost response is safe to retry. A
	// different intent may never reuse the same client command ID.
	if normalized.ClientCommandID.Valid {
		existing, lookupErr := s.queries.GetMoneyRecordDraftByClientCommandID(ctx, db.GetMoneyRecordDraftByClientCommandIDParams{
			WorkspaceID:     workspaceID,
			ClientCommandID: normalized.ClientCommandID,
		})
		if lookupErr == nil {
			if draftMatchesNormalizedCommand(existing, normalized) {
				return existing, nil
			}
			return db.MoneyRecordDraft{}, ErrIdempotencyConflict
		}
		if !errors.Is(lookupErr, pgx.ErrNoRows) {
			return db.MoneyRecordDraft{}, lookupErr
		}
	}

	created, err := s.queries.CreateMoneyRecordDraft(ctx, db.CreateMoneyRecordDraftParams{
		WorkspaceID: workspaceID, CreatedByUserID: userID, State: state, SchemaVersion: 1,
		EntryMethod: normalized.EntryMethod, Direction: normalized.Direction, ScopeType: normalized.ScopeType,
		Purpose: normalized.Purpose, AmountMinor: normalized.AmountMinor, Currency: normalized.Currency,
		CurrencyExponent: normalized.CurrencyExponent, EffectiveDate: normalized.EffectiveDate,
		MoneyAccountID: normalized.MoneyAccountID, DestinationAccountID: normalized.DestinationAccountID,
		CategoryID: normalized.CategoryID, CounterpartyID: normalized.CounterpartyID,
		CounterpartyName: normalized.CounterpartyName, Description: normalized.Description,
		Reference: normalized.Reference, Tags: normalized.Tags, Payload: normalized.Payload,
		AiMetadata: normalized.AIMetadata, ClientCommandID: normalized.ClientCommandID,
	})
	if err == nil || !normalized.ClientCommandID.Valid {
		return created, err
	}

	// Two tabs can pass the read-before-write lookup together. The unique index
	// is the final concurrency guard; fetch its winner and apply the same
	// payload-equality rule instead of leaking a PostgreSQL constraint error.
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return db.MoneyRecordDraft{}, err
	}
	existing, lookupErr := s.queries.GetMoneyRecordDraftByClientCommandID(ctx, db.GetMoneyRecordDraftByClientCommandIDParams{
		WorkspaceID:     workspaceID,
		ClientCommandID: normalized.ClientCommandID,
	})
	if lookupErr != nil {
		return db.MoneyRecordDraft{}, lookupErr
	}
	if !draftMatchesNormalizedCommand(existing, normalized) {
		return db.MoneyRecordDraft{}, ErrIdempotencyConflict
	}
	return existing, nil
}

// draftMatchesNormalizedCommand is intentionally field-by-field. A command ID
// denotes one user intent; accepting a changed amount, account or payload would
// make a reconnect silently mutate that intent.
func draftMatchesNormalizedCommand(draft db.MoneyRecordDraft, normalized normalizedMoneyRecordDraft) bool {
	return draft.EntryMethod == normalized.EntryMethod &&
		draft.Direction == normalized.Direction &&
		draft.ScopeType == normalized.ScopeType &&
		draft.Purpose == normalized.Purpose &&
		draft.AmountMinor == normalized.AmountMinor &&
		draft.Currency == normalized.Currency &&
		draft.CurrencyExponent == normalized.CurrencyExponent &&
		draft.EffectiveDate.Time.Equal(normalized.EffectiveDate.Time) &&
		pgInt8Equal(draft.MoneyAccountID, normalized.MoneyAccountID) &&
		pgInt8Equal(draft.DestinationAccountID, normalized.DestinationAccountID) &&
		pgInt8Equal(draft.CategoryID, normalized.CategoryID) &&
		pgInt8Equal(draft.CounterpartyID, normalized.CounterpartyID) &&
		pgTextEqual(draft.CounterpartyName, normalized.CounterpartyName) &&
		pgTextEqual(draft.Description, normalized.Description) &&
		pgTextEqual(draft.Reference, normalized.Reference) &&
		canonicalJSONEqual(draft.Tags, normalized.Tags) &&
		canonicalJSONEqual(draft.Payload, normalized.Payload) &&
		canonicalJSONEqual(draft.AiMetadata, normalized.AIMetadata)
}

func pgInt8Equal(a, b pgtype.Int8) bool {
	return a.Valid == b.Valid && (!a.Valid || a.Int64 == b.Int64)
}
func pgTextEqual(a, b pgtype.Text) bool {
	return a.Valid == b.Valid && (!a.Valid || a.String == b.String)
}

func canonicalJSONEqual(a, b []byte) bool {
	var left, right any
	if json.Unmarshal(a, &left) != nil || json.Unmarshal(b, &right) != nil {
		return false
	}
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && string(leftJSON) == string(rightJSON)
}

func (s *Service) UpdateMoneyRecordDraft(ctx context.Context, workspaceID, userID int64, workspaceKind string, draftID int64, in UpdateMoneyRecordDraftInput) (db.MoneyRecordDraft, error) {
	if in.ExpectedVersion <= 0 {
		return db.MoneyRecordDraft{}, ErrDraftVersionConflict
	}
	existing, err := s.queries.GetMoneyRecordDraft(ctx, db.GetMoneyRecordDraftParams{ID: draftID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.MoneyRecordDraft{}, ErrNotFound
	}
	if err != nil {
		return db.MoneyRecordDraft{}, err
	}
	if existing.CreatedByUserID != userID {
		return db.MoneyRecordDraft{}, ErrDraftNotOwned
	}
	if existing.Version != in.ExpectedVersion {
		return db.MoneyRecordDraft{}, ErrDraftVersionConflict
	}

	normalized, state, err := s.normalizeMoneyRecordDraft(ctx, s.queries, workspaceID, workspaceKind, in.MoneyRecordDraftInput, false)
	if err != nil {
		return db.MoneyRecordDraft{}, err
	}
	draft, err := s.queries.UpdateMoneyRecordDraft(ctx, db.UpdateMoneyRecordDraftParams{
		ID: draftID, WorkspaceID: workspaceID, State: state, EntryMethod: normalized.EntryMethod,
		Direction: normalized.Direction, ScopeType: normalized.ScopeType, Purpose: normalized.Purpose,
		AmountMinor: normalized.AmountMinor, Currency: normalized.Currency, CurrencyExponent: normalized.CurrencyExponent,
		EffectiveDate: normalized.EffectiveDate, MoneyAccountID: normalized.MoneyAccountID,
		DestinationAccountID: normalized.DestinationAccountID, CategoryID: normalized.CategoryID,
		CounterpartyID: normalized.CounterpartyID, CounterpartyName: normalized.CounterpartyName,
		Description: normalized.Description, Reference: normalized.Reference, Tags: normalized.Tags,
		Payload: normalized.Payload, AiMetadata: normalized.AIMetadata, Version: in.ExpectedVersion,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.MoneyRecordDraft{}, ErrDraftVersionConflict
	}
	return draft, err
}

func (s *Service) DiscardMoneyRecordDraft(ctx context.Context, workspaceID, userID, draftID int64, expectedVersion int32) (db.MoneyRecordDraft, error) {
	draft, err := s.queries.GetMoneyRecordDraft(ctx, db.GetMoneyRecordDraftParams{ID: draftID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.MoneyRecordDraft{}, ErrNotFound
	}
	if err != nil {
		return db.MoneyRecordDraft{}, err
	}
	if draft.CreatedByUserID != userID {
		return db.MoneyRecordDraft{}, ErrDraftNotOwned
	}
	deleted, err := s.queries.DiscardMoneyRecordDraft(ctx, db.DiscardMoneyRecordDraftParams{ID: draftID, WorkspaceID: workspaceID, Version: expectedVersion})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.MoneyRecordDraft{}, ErrDraftVersionConflict
	}
	return deleted, err
}

func (s *Service) PreviewMoneyRecordDraft(ctx context.Context, workspaceID int64, workspaceKind string, draftID int64) (MoneyRecordPreview, error) {
	draft, err := s.queries.GetMoneyRecordDraft(ctx, db.GetMoneyRecordDraftParams{ID: draftID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MoneyRecordPreview{}, ErrNotFound
	}
	if err != nil {
		return MoneyRecordPreview{}, err
	}
	if draft.State == "discarded" || draft.State == "confirmed" {
		return MoneyRecordPreview{}, ErrDraftNotConfirmable
	}

	input := draftToInput(draft)
	normalized, _, validationErr := s.normalizeMoneyRecordDraft(ctx, s.queries, workspaceID, workspaceKind, input, true)
	if validationErr == nil {
		_, validationErr = validateConfirmationAccounts(ctx, s.queries, workspaceID, normalized)
	}
	preview := buildMoneyRecordPreview(draft, validationErr)
	return preview, nil
}

func (s *Service) ListMoneyRecordDrafts(ctx context.Context, workspaceID int64, state string, beforeID int64, limit int32) ([]db.MoneyRecordDraft, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var stateParam pgtype.Text
	if trimmed := strings.TrimSpace(state); trimmed != "" {
		stateParam = pgtype.Text{String: trimmed, Valid: true}
	}
	var beforeParam pgtype.Int8
	if beforeID > 0 {
		beforeParam = pgtype.Int8{Int64: beforeID, Valid: true}
	}
	return s.queries.ListMoneyRecordDrafts(ctx, db.ListMoneyRecordDraftsParams{WorkspaceID: workspaceID, Limit: limit, State: stateParam, BeforeID: beforeParam})
}

func (s *Service) GetMoneyRecordDraft(ctx context.Context, workspaceID, draftID int64) (db.MoneyRecordDraft, error) {
	draft, err := s.queries.GetMoneyRecordDraft(ctx, db.GetMoneyRecordDraftParams{ID: draftID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.MoneyRecordDraft{}, ErrNotFound
	}
	return draft, err
}

func (s *Service) GetMoneyRecordDraftDetail(ctx context.Context, workspaceID, draftID int64) (MoneyRecordDraftDetail, error) {
	draft, err := s.GetMoneyRecordDraft(ctx, workspaceID, draftID)
	if err != nil {
		return MoneyRecordDraftDetail{}, err
	}
	links, err := s.queries.ListMoneyRecordDraftLinks(ctx, db.ListMoneyRecordDraftLinksParams{DraftID: draft.ID, WorkspaceID: workspaceID})
	if err != nil {
		return MoneyRecordDraftDetail{}, err
	}
	evidence, err := s.queries.ListEvidenceAssetsByDraftID(ctx, db.ListEvidenceAssetsByDraftIDParams{
		WorkspaceID: workspaceID,
		DraftID:     pgtype.Int8{Int64: draft.ID, Valid: true},
	})
	if err != nil {
		return MoneyRecordDraftDetail{}, err
	}
	return MoneyRecordDraftDetail{Draft: draft, Links: links, Evidence: evidence}, nil
}

func (s *Service) CreateMoneyRecordDraftLink(ctx context.Context, workspaceID, userID, draftID int64, in MoneyRecordDraftLinkInput) (db.MoneyRecordDraftLink, error) {
	draft, err := s.queries.GetMoneyRecordDraft(ctx, db.GetMoneyRecordDraftParams{ID: draftID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.MoneyRecordDraftLink{}, ErrNotFound
	}
	if err != nil {
		return db.MoneyRecordDraftLink{}, err
	}
	if draft.CreatedByUserID != userID {
		return db.MoneyRecordDraftLink{}, ErrDraftNotOwned
	}
	if draft.State != "saved" && draft.State != "needs_review" && draft.State != "failed" {
		return db.MoneyRecordDraftLink{}, ErrDraftNotEditable
	}
	linkType := strings.ToLower(strings.TrimSpace(in.LinkType))
	if err := validateDraftLinkTarget(ctx, s.queries, workspaceID, linkType, in.LinkedRecordID); err != nil {
		return db.MoneyRecordDraftLink{}, err
	}
	metadata, err := normalizeJSON(in.Metadata, "{}", false, maxDraftJSONBytes)
	if err != nil {
		return db.MoneyRecordDraftLink{}, ErrInvalidDraftPayload
	}
	var allocated pgtype.Int8
	if raw := strings.TrimSpace(in.AllocatedAmountMinor); raw != "" {
		amount, parseErr := parseDraftAmount("", raw, 0)
		if parseErr != nil {
			return db.MoneyRecordDraftLink{}, parseErr
		}
		allocated = pgtype.Int8{Int64: amount, Valid: true}
	}
	return s.queries.CreateMoneyRecordDraftLink(ctx, db.CreateMoneyRecordDraftLinkParams{DraftID: draftID, WorkspaceID: workspaceID, LinkType: linkType, LinkedRecordID: in.LinkedRecordID, AllocatedAmountMinor: allocated, Metadata: metadata})
}

func (s *Service) ListMoneyRecordDraftLinks(ctx context.Context, workspaceID, draftID int64) ([]db.MoneyRecordDraftLink, error) {
	return s.queries.ListMoneyRecordDraftLinks(ctx, db.ListMoneyRecordDraftLinksParams{DraftID: draftID, WorkspaceID: workspaceID})
}

func (s *Service) ListMoneyRecords(ctx context.Context, workspaceID int64, status string, beforeID int64, limit int32) ([]db.MoneyRecord, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var statusParam pgtype.Text
	if trimmed := strings.TrimSpace(status); trimmed != "" {
		statusParam = pgtype.Text{String: trimmed, Valid: true}
	}
	var beforeParam pgtype.Int8
	if beforeID > 0 {
		beforeParam = pgtype.Int8{Int64: beforeID, Valid: true}
	}
	return s.queries.ListMoneyRecords(ctx, db.ListMoneyRecordsParams{WorkspaceID: workspaceID, Limit: limit, Status: statusParam, BeforeID: beforeParam})
}

func (s *Service) GetMoneyRecordDetail(ctx context.Context, workspaceID, recordID int64) (MoneyRecordDetail, error) {
	record, err := s.queries.GetMoneyRecordByID(ctx, db.GetMoneyRecordByIDParams{ID: recordID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MoneyRecordDetail{}, ErrNotFound
	}
	if err != nil {
		return MoneyRecordDetail{}, err
	}
	parts, err := s.queries.ListMoneyRecordParts(ctx, db.ListMoneyRecordPartsParams{MoneyRecordID: record.ID, WorkspaceID: workspaceID})
	if err != nil {
		return MoneyRecordDetail{}, err
	}
	links, err := s.queries.ListMoneyRecordLinks(ctx, db.ListMoneyRecordLinksParams{MoneyRecordID: record.ID, WorkspaceID: workspaceID})
	if err != nil {
		return MoneyRecordDetail{}, err
	}
	evidence, err := s.queries.ListEvidenceAssetsByMoneyRecordID(ctx, db.ListEvidenceAssetsByMoneyRecordIDParams{WorkspaceID: workspaceID, MoneyRecordID: pgtype.Int8{Int64: record.ID, Valid: true}})
	if err != nil {
		return MoneyRecordDetail{}, err
	}
	transaction, err := s.queries.GetMoneyTransactionByID(ctx, db.GetMoneyTransactionByIDParams{ID: record.TransactionID.Int64, WorkspaceID: workspaceID})
	if err != nil {
		return MoneyRecordDetail{}, err
	}
	return MoneyRecordDetail{Record: record, Parts: parts, Links: links, Evidence: evidence, Transaction: transaction}, nil
}

func (s *Service) ConfirmMoneyRecord(ctx context.Context, workspaceID, userID int64, workspaceKind, idempotencyKey string, in ConfirmMoneyRecordInput) (MoneyRecordConfirmation, error) {
	key := strings.TrimSpace(idempotencyKey)
	if key == "" {
		return MoneyRecordConfirmation{}, ErrIdempotencyRequired
	}
	if in.DraftID <= 0 || in.ExpectedVersion <= 0 {
		return MoneyRecordConfirmation{}, ErrDraftVersionConflict
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	requestDigest := sha256.Sum256([]byte(fmt.Sprintf("money_record_confirm:%d:%d:%d", workspaceID, in.DraftID, in.ExpectedVersion)))
	keyDigest := sha256.Sum256([]byte(key))
	var storedDigest []byte
	var storedStatus string
	var storedResourceID *string
	err = tx.QueryRow(ctx, `
		SELECT request_digest, status, resource_id
		FROM idempotency_records
		WHERE actor_user_id = $1 AND operation = 'confirm_money_record' AND key_digest = $2
		FOR UPDATE
	`, userID, keyDigest[:]).Scan(&storedDigest, &storedStatus, &storedResourceID)
	if err == nil {
		if string(storedDigest) != string(requestDigest[:]) {
			return MoneyRecordConfirmation{}, ErrIdempotencyConflict
		}
		if storedStatus == "completed" && storedResourceID != nil {
			recordID, parseErr := strconv.ParseInt(*storedResourceID, 10, 64)
			if parseErr != nil {
				return MoneyRecordConfirmation{}, fmt.Errorf("read idempotent confirmation: %w", parseErr)
			}
			return s.loadConfirmedMoneyRecord(ctx, qtx, workspaceID, recordID, true)
		}
		return MoneyRecordConfirmation{}, errors.New("matching money command is already processing")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return MoneyRecordConfirmation{}, err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO idempotency_records (actor_user_id, operation, key_digest, request_digest, expires_at)
		VALUES ($1, 'confirm_money_record', $2, $3, now() + interval '24 hours')
	`, userID, keyDigest[:], requestDigest[:])
	if err != nil {
		return MoneyRecordConfirmation{}, fmt.Errorf("reserve idempotency key: %w", err)
	}

	draft, err := qtx.GetMoneyRecordDraftForUpdate(ctx, db.GetMoneyRecordDraftForUpdateParams{ID: in.DraftID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MoneyRecordConfirmation{}, ErrNotFound
	}
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	if draft.CreatedByUserID != userID {
		return MoneyRecordConfirmation{}, ErrDraftNotOwned
	}
	if draft.State == "confirmed" && draft.ConfirmedRecordID.Valid {
		result, loadErr := s.loadConfirmedMoneyRecord(ctx, qtx, workspaceID, draft.ConfirmedRecordID.Int64, true)
		if loadErr != nil {
			return MoneyRecordConfirmation{}, loadErr
		}
		return result, nil
	}
	if draft.Version != in.ExpectedVersion {
		return MoneyRecordConfirmation{}, ErrDraftVersionConflict
	}
	if draft.State != "saved" && draft.State != "needs_review" && draft.State != "failed" {
		return MoneyRecordConfirmation{}, ErrDraftNotConfirmable
	}

	normalized, _, err := s.normalizeMoneyRecordDraft(ctx, qtx, workspaceID, workspaceKind, draftToInput(draft), true)
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	if normalized.ScopeType == "mixed" {
		return MoneyRecordConfirmation{}, ErrMixedRuleNotConfigured
	}
	if normalized.EffectiveDate.Time.After(time.Now().UTC().Add(24 * time.Hour)) {
		return MoneyRecordConfirmation{}, ErrFutureDatedConfirmation
	}

	sourceAccount, err := validateConfirmationAccounts(ctx, qtx, workspaceID, normalized)
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}

	transaction, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
		WorkspaceID: workspaceID, Direction: normalized.Direction, Status: "posted", AmountMinor: normalized.AmountMinor,
		Currency: normalized.Currency, CurrencyExponent: normalized.CurrencyExponent, EffectiveDate: normalized.EffectiveDate,
		MoneyAccountID: normalized.MoneyAccountID, DestinationAccountID: normalized.DestinationAccountID,
		CategoryID: normalized.CategoryID, CounterpartyName: normalized.CounterpartyName, Purpose: normalized.Purpose,
		Notes: normalized.Description, Reference: normalized.Reference,
		IdempotencyKey: pgtype.Text{String: key, Valid: true}, CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
		PostedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
	if err != nil {
		return MoneyRecordConfirmation{}, fmt.Errorf("create confirmed money transaction: %w", err)
	}

	entry, lines, err := s.createPurposeAwareLedger(ctx, qtx, workspaceID, transaction, sourceAccount, normalized.ScopeType)
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	record, err := qtx.CreateMoneyRecord(ctx, db.CreateMoneyRecordParams{
		WorkspaceID: workspaceID, DraftID: pgtype.Int8{Int64: draft.ID, Valid: true}, TransactionID: pgtype.Int8{Int64: transaction.ID, Valid: true},
		Direction: normalized.Direction, ScopeType: normalized.ScopeType, Purpose: normalized.Purpose, EntryMethod: normalized.EntryMethod,
		AmountMinor: normalized.AmountMinor, Currency: normalized.Currency, CurrencyExponent: normalized.CurrencyExponent,
		EffectiveDate: normalized.EffectiveDate, MoneyAccountID: normalized.MoneyAccountID, DestinationAccountID: normalized.DestinationAccountID,
		CategoryID: normalized.CategoryID, CounterpartyID: normalized.CounterpartyID, CounterpartyName: normalized.CounterpartyName,
		Description: normalized.Description, Reference: normalized.Reference,
		CreatedByUserID: pgtype.Int8{Int64: draft.CreatedByUserID, Valid: true}, ConfirmedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return MoneyRecordConfirmation{}, fmt.Errorf("create confirmed money record: %w", err)
	}
	_, err = qtx.CreateMoneyRecordPart(ctx, db.CreateMoneyRecordPartParams{
		MoneyRecordID: record.ID, WorkspaceID: workspaceID, AmountMinor: normalized.AmountMinor, Currency: normalized.Currency,
		Purpose: normalized.Purpose, CategoryID: normalized.CategoryID, TransactionID: pgtype.Int8{Int64: transaction.ID, Valid: true},
	})
	if err != nil {
		return MoneyRecordConfirmation{}, fmt.Errorf("create money record part: %w", err)
	}
	draftLinks, err := qtx.ListMoneyRecordDraftLinks(ctx, db.ListMoneyRecordDraftLinksParams{DraftID: draft.ID, WorkspaceID: workspaceID})
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	for _, link := range draftLinks {
		if _, err := qtx.CreateMoneyRecordLink(ctx, db.CreateMoneyRecordLinkParams{MoneyRecordID: record.ID, WorkspaceID: workspaceID, LinkType: link.LinkType, LinkedRecordID: link.LinkedRecordID, AllocatedAmountMinor: link.AllocatedAmountMinor, Metadata: link.Metadata}); err != nil {
			return MoneyRecordConfirmation{}, fmt.Errorf("copy draft link to confirmed record: %w", err)
		}
	}
	_, err = qtx.AttachEvidenceAssetsToMoneyRecord(ctx, db.AttachEvidenceAssetsToMoneyRecordParams{
		WorkspaceID: workspaceID, DraftID: pgtype.Int8{Int64: draft.ID, Valid: true}, MoneyRecordID: pgtype.Int8{Int64: record.ID, Valid: true},
	})
	if err != nil {
		return MoneyRecordConfirmation{}, fmt.Errorf("attach evidence: %w", err)
	}
	auditMetadata, err := json.Marshal(map[string]string{
		"entry_method":   normalized.EntryMethod,
		"purpose":        normalized.Purpose,
		"transaction_id": strconv.FormatInt(transaction.ID, 10),
	})
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO audit_events (actor_user_id, workspace_id, event_type, subject_type, subject_id, metadata)
		VALUES ($1, $2, 'money_record_confirmed', 'money_record', $3, $4::jsonb)
	`, userID, workspaceID, strconv.FormatInt(record.ID, 10), auditMetadata)
	if err != nil {
		return MoneyRecordConfirmation{}, fmt.Errorf("write money record audit event: %w", err)
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_jobs (job_type, aggregate_type, aggregate_id, payload)
		VALUES ('money_record_confirmed', 'money_record', $1::text, jsonb_build_object('workspace_id', $2::bigint, 'money_record_id', $1::bigint))
	`, strconv.FormatInt(record.ID, 10), workspaceID)
	if err != nil {
		return MoneyRecordConfirmation{}, fmt.Errorf("enqueue money record event: %w", err)
	}
	confirmedDraft, err := qtx.MarkMoneyRecordDraftConfirmed(ctx, db.MarkMoneyRecordDraftConfirmedParams{
		ID: draft.ID, WorkspaceID: workspaceID, ConfirmedRecordID: pgtype.Int8{Int64: record.ID, Valid: true}, Version: in.ExpectedVersion,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return MoneyRecordConfirmation{}, ErrDraftVersionConflict
	}
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	evidence, err := qtx.ListEvidenceAssetsByMoneyRecordID(ctx, db.ListEvidenceAssetsByMoneyRecordIDParams{WorkspaceID: workspaceID, MoneyRecordID: pgtype.Int8{Int64: record.ID, Valid: true}})
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	_, err = tx.Exec(ctx, `
		UPDATE idempotency_records
		SET status = 'completed', response_code = 201, resource_type = 'money_record', resource_id = $3, updated_at = now()
		WHERE actor_user_id = $1 AND operation = 'confirm_money_record' AND key_digest = $2
	`, userID, keyDigest[:], strconv.FormatInt(record.ID, 10))
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MoneyRecordConfirmation{}, err
	}
	return MoneyRecordConfirmation{Draft: confirmedDraft, Record: record, Transaction: transaction, LedgerEntry: *entry, LedgerLines: lines, Evidence: evidence}, nil
}

func (s *Service) loadConfirmedMoneyRecord(ctx context.Context, qtx *db.Queries, workspaceID, recordID int64, duplicate bool) (MoneyRecordConfirmation, error) {
	record, err := qtx.GetMoneyRecordByID(ctx, db.GetMoneyRecordByIDParams{ID: recordID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MoneyRecordConfirmation{}, ErrNotFound
	}
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	transaction, err := qtx.GetMoneyTransactionByID(ctx, db.GetMoneyTransactionByIDParams{ID: record.TransactionID.Int64, WorkspaceID: workspaceID})
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	draft, err := qtx.GetMoneyRecordDraft(ctx, db.GetMoneyRecordDraftParams{ID: record.DraftID.Int64, WorkspaceID: workspaceID})
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	evidence, err := qtx.ListEvidenceAssetsByMoneyRecordID(ctx, db.ListEvidenceAssetsByMoneyRecordIDParams{WorkspaceID: workspaceID, MoneyRecordID: pgtype.Int8{Int64: record.ID, Valid: true}})
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	entry, err := qtx.GetMoneyRecordLedgerEntry(ctx, db.GetMoneyRecordLedgerEntryParams{ID: record.ID, WorkspaceID: workspaceID})
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	lines, err := qtx.GetLedgerLinesByEntryID(ctx, db.GetLedgerLinesByEntryIDParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID})
	if err != nil {
		return MoneyRecordConfirmation{}, err
	}
	return MoneyRecordConfirmation{Draft: draft, Record: record, Transaction: transaction, LedgerEntry: entry, LedgerLines: lines, Evidence: evidence, WasDuplicate: duplicate}, nil
}

func validateDraftLinkTarget(ctx context.Context, q *db.Queries, workspaceID int64, linkType string, linkedRecordID int64) error {
	if linkedRecordID <= 0 {
		return ErrNotFound
	}
	var err error
	switch linkType {
	case "invoice":
		_, err = q.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{ID: linkedRecordID, WorkspaceID: workspaceID})
	case "sale":
		_, err = q.GetSaleByID(ctx, db.GetSaleByIDParams{ID: linkedRecordID, WorkspaceID: workspaceID})
	case "purchase":
		_, err = q.GetPurchaseByID(ctx, db.GetPurchaseByIDParams{ID: linkedRecordID, WorkspaceID: workspaceID})
	default:
		return errors.New("this linked source is not available in the current product slice")
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func validateConfirmationAccounts(ctx context.Context, q *db.Queries, workspaceID int64, normalized normalizedMoneyRecordDraft) (db.MoneyAccount, error) {
	if !normalized.MoneyAccountID.Valid {
		return db.MoneyAccount{}, ErrForbiddenAccount
	}
	source, err := q.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: normalized.MoneyAccountID.Int64, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.MoneyAccount{}, ErrForbiddenAccount
	}
	if err != nil {
		return db.MoneyAccount{}, err
	}
	if !source.IsActive {
		return db.MoneyAccount{}, ErrAccountInactive
	}
	if source.Currency != normalized.Currency {
		return db.MoneyAccount{}, ErrAccountCurrencyMismatch
	}
	if normalized.Direction != "transfer" {
		return source, nil
	}
	if !normalized.DestinationAccountID.Valid {
		return db.MoneyAccount{}, ErrForbiddenAccount
	}
	destination, err := q.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: normalized.DestinationAccountID.Int64, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.MoneyAccount{}, ErrForbiddenAccount
	}
	if err != nil {
		return db.MoneyAccount{}, err
	}
	if !destination.IsActive {
		return db.MoneyAccount{}, ErrAccountInactive
	}
	if destination.Currency != normalized.Currency {
		return db.MoneyAccount{}, ErrAccountCurrencyMismatch
	}
	return source, nil
}

type normalizedMoneyRecordDraft struct {
	EntryMethod          string
	Direction            string
	ScopeType            string
	Purpose              string
	AmountMinor          int64
	Currency             string
	CurrencyExponent     int32
	EffectiveDate        pgtype.Date
	MoneyAccountID       pgtype.Int8
	DestinationAccountID pgtype.Int8
	CategoryID           pgtype.Int8
	CounterpartyID       pgtype.Int8
	CounterpartyName     pgtype.Text
	Description          pgtype.Text
	Reference            pgtype.Text
	Tags                 []byte
	Payload              []byte
	AIMetadata           []byte
	ClientCommandID      pgtype.Text
}

func (s *Service) normalizeMoneyRecordDraft(ctx context.Context, q *db.Queries, workspaceID int64, workspaceKind string, in MoneyRecordDraftInput, strict bool) (normalizedMoneyRecordDraft, string, error) {
	entryMethod := strings.ToLower(strings.TrimSpace(in.EntryMethod))
	if entryMethod == "" {
		entryMethod = "manual"
	}
	if entryMethod != "manual" && entryMethod != "ai_assisted" && entryMethod != "import" && entryMethod != "offline" {
		return normalizedMoneyRecordDraft{}, "", errors.New("invalid entry method")
	}
	direction := strings.ToLower(strings.TrimSpace(in.Direction))
	if direction != "money_in" && direction != "money_out" && direction != "transfer" {
		return normalizedMoneyRecordDraft{}, "", ErrInvalidDirection
	}
	scopeType := strings.ToLower(strings.TrimSpace(in.ScopeType))
	if err := validateWorkspaceScope(workspaceKind, direction, scopeType); err != nil {
		return normalizedMoneyRecordDraft{}, "", err
	}
	purpose := normalizePurpose(in.Purpose, direction)
	if !purposeAllowed(scopeType, purpose) {
		return normalizedMoneyRecordDraft{}, "", ErrPurposeNotAllowed
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := CurrencyExponent(currency)
	amountMinor, err := parseDraftAmount(in.Amount, in.AmountMinor, exponent)
	if err != nil {
		return normalizedMoneyRecordDraft{}, "", err
	}
	effectiveDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.EffectiveDate))
	if err != nil {
		return normalizedMoneyRecordDraft{}, "", fmt.Errorf("invalid effective date: %w", err)
	}
	tags, err := normalizeJSON(in.Tags, "[]", true, maxTagsJSONBytes)
	if err != nil {
		return normalizedMoneyRecordDraft{}, "", ErrInvalidDraftTags
	}
	payload, err := normalizeJSON(in.Payload, "{}", false, maxDraftJSONBytes)
	if err != nil {
		return normalizedMoneyRecordDraft{}, "", ErrInvalidDraftPayload
	}
	aiMetadata, err := normalizeJSON(in.AIMetadata, "{}", false, maxDraftJSONBytes)
	if err != nil {
		return normalizedMoneyRecordDraft{}, "", ErrInvalidDraftPayload
	}

	normalized := normalizedMoneyRecordDraft{
		EntryMethod: entryMethod, Direction: direction, ScopeType: scopeType, Purpose: purpose,
		AmountMinor: amountMinor, Currency: currency, CurrencyExponent: int32(exponent),
		EffectiveDate: pgtype.Date{Time: effectiveDate, Valid: true}, Tags: tags, Payload: payload, AIMetadata: aiMetadata,
		CounterpartyName: optionalPgText(in.CounterpartyName), Description: optionalPgText(in.Description),
		Reference: optionalPgText(in.Reference), ClientCommandID: optionalPgText(in.ClientCommandID),
	}
	if in.MoneyAccountID != nil && *in.MoneyAccountID > 0 {
		normalized.MoneyAccountID = pgtype.Int8{Int64: *in.MoneyAccountID, Valid: true}
	}
	if in.DestinationAccountID != nil && *in.DestinationAccountID > 0 {
		normalized.DestinationAccountID = pgtype.Int8{Int64: *in.DestinationAccountID, Valid: true}
	}
	if in.CategoryID != nil && *in.CategoryID > 0 {
		category, getErr := q.GetCategoryByID(ctx, db.GetCategoryByIDParams{ID: *in.CategoryID, WorkspaceID: workspaceID})
		if getErr != nil || !category.IsActive {
			return normalizedMoneyRecordDraft{}, "", ErrForbiddenCategory
		}
		normalized.CategoryID = pgtype.Int8{Int64: category.ID, Valid: true}
	}
	if in.CounterpartyID != nil && *in.CounterpartyID > 0 {
		counterparty, getErr := q.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{ID: *in.CounterpartyID, WorkspaceID: workspaceID})
		if getErr != nil || !counterparty.IsActive {
			return normalizedMoneyRecordDraft{}, "", ErrNotFound
		}
		normalized.CounterpartyID = pgtype.Int8{Int64: counterparty.ID, Valid: true}
		if !normalized.CounterpartyName.Valid {
			normalized.CounterpartyName = pgtype.Text{String: counterparty.Name, Valid: true}
		}
	}
	if normalized.Direction == "transfer" && normalized.DestinationAccountID.Valid && normalized.MoneyAccountID.Valid && normalized.DestinationAccountID.Int64 == normalized.MoneyAccountID.Int64 {
		return normalizedMoneyRecordDraft{}, "", ErrTransferSameAccount
	}
	if strict {
		if !normalized.MoneyAccountID.Valid {
			return normalizedMoneyRecordDraft{}, "", errors.New("money account is required before confirmation")
		}
		if normalized.Direction == "transfer" && !normalized.DestinationAccountID.Valid {
			return normalizedMoneyRecordDraft{}, "", errors.New("destination account is required for transfer")
		}
		if requiresCategory(normalized.ScopeType, normalized.Purpose) && !normalized.CategoryID.Valid {
			return normalizedMoneyRecordDraft{}, "", errors.New("category is required for this purpose")
		}
		if requiresCounterparty(normalized.Purpose) && !normalized.CounterpartyID.Valid && !normalized.CounterpartyName.Valid {
			return normalizedMoneyRecordDraft{}, "", errors.New("counterparty is required for this purpose")
		}
		if requiresAllocation(normalized.Purpose) {
			return normalizedMoneyRecordDraft{}, "", ErrAllocationRequired
		}
	}
	state := "saved"
	if entryMethod == "ai_assisted" || entryMethod == "import" || scopeType == "mixed" {
		state = "needs_review"
	}
	return normalized, state, nil
}

func validateWorkspaceScope(workspaceKind, direction, scopeType string) error {
	switch scopeType {
	case "personal":
		if workspaceKind != "personal" || direction == "transfer" {
			return ErrCrossWorkspaceScope
		}
	case "business":
		if workspaceKind != "business" || direction == "transfer" {
			return ErrCrossWorkspaceScope
		}
	case "transfer":
		if direction != "transfer" {
			return ErrCrossWorkspaceScope
		}
	case "mixed":
		return ErrMixedRuleNotConfigured
	default:
		return ErrCrossWorkspaceScope
	}
	return nil
}

func normalizePurpose(raw, direction string) string {
	purpose := strings.ToLower(strings.TrimSpace(raw))
	if purpose != "" {
		return purpose
	}
	if direction == "transfer" {
		return "transfer"
	}
	return "not_yet_known"
}

func purposeAllowed(scope, purpose string) bool {
	if purpose == "transfer" {
		return scope == "transfer"
	}
	if scope == "personal" {
		_, ok := map[string]struct{}{
			"normal_income": {}, "normal_expense": {}, "loan_borrowed": {}, "loan_repaid": {}, "loan_lent": {}, "loan_collected": {},
			"investment_contribution": {}, "investment_income": {}, "investment_disposal": {}, "asset_purchase": {}, "asset_disposal": {},
			"refund": {}, "owner_transfer": {}, "not_yet_known": {}, "not_yet_classified": {},
		}[purpose]
		return ok
	}
	if scope == "business" {
		_, ok := map[string]struct{}{
			"invoice_payment": {}, "immediate_sale": {}, "customer_advance": {}, "supplier_bill_payment": {}, "immediate_purchase": {},
			"supplier_advance": {}, "customer_refund": {}, "supplier_refund": {}, "loan_proceeds": {}, "loan_repayment": {},
			"owner_capital": {}, "owner_drawing": {}, "tax_payment": {}, "tax_refund": {}, "other_income": {}, "other_expense": {},
			"not_yet_known": {},
		}[purpose]
		return ok
	}
	return false
}

func requiresCategory(scope, purpose string) bool {
	if purpose == "not_yet_known" || purpose == "not_yet_classified" || purpose == "transfer" {
		return false
	}
	if scope == "business" {
		switch purpose {
		case "customer_advance", "supplier_advance", "loan_proceeds", "loan_repayment", "owner_capital", "owner_drawing", "tax_payment", "tax_refund":
			return false
		}
	}
	return true
}

func requiresCounterparty(purpose string) bool {
	switch purpose {
	case "customer_advance", "supplier_advance", "customer_refund", "supplier_refund", "loan_proceeds", "loan_repayment", "owner_capital", "owner_drawing":
		return true
	default:
		return false
	}
}

func requiresAllocation(purpose string) bool {
	return purpose == "invoice_payment" || purpose == "supplier_bill_payment"
}

func parseDraftAmount(amount, amountMinor string, exponent int) (int64, error) {
	if strings.TrimSpace(amount) != "" && strings.TrimSpace(amountMinor) != "" {
		return 0, errors.New("provide either amount or amount_minor, not both")
	}
	if strings.TrimSpace(amount) != "" {
		return ParseMajorToMinor(amount, exponent)
	}
	minor := strings.TrimSpace(amountMinor)
	if minor == "" {
		return 0, ErrInvalidAmount
	}
	for _, char := range minor {
		if char < '0' || char > '9' {
			return 0, ErrInvalidAmount
		}
	}
	parsed, err := strconv.ParseInt(minor, 10, 64)
	if err != nil || parsed <= 0 {
		return 0, ErrInvalidAmount
	}
	return parsed, nil
}

func normalizeJSON(input json.RawMessage, fallback string, wantArray bool, maxBytes int) ([]byte, error) {
	if len(input) == 0 {
		return []byte(fallback), nil
	}
	if len(input) > maxBytes || !json.Valid(input) {
		return nil, ErrInvalidDraftPayload
	}
	var value any
	if err := json.Unmarshal(input, &value); err != nil {
		return nil, err
	}
	if wantArray {
		if _, ok := value.([]any); !ok {
			return nil, ErrInvalidDraftTags
		}
	} else if _, ok := value.(map[string]any); !ok {
		return nil, ErrInvalidDraftPayload
	}
	return input, nil
}

func draftToInput(draft db.MoneyRecordDraft) MoneyRecordDraftInput {
	var moneyAccountID, destinationAccountID, categoryID, counterpartyID *int64
	if draft.MoneyAccountID.Valid {
		value := draft.MoneyAccountID.Int64
		moneyAccountID = &value
	}
	if draft.DestinationAccountID.Valid {
		value := draft.DestinationAccountID.Int64
		destinationAccountID = &value
	}
	if draft.CategoryID.Valid {
		value := draft.CategoryID.Int64
		categoryID = &value
	}
	if draft.CounterpartyID.Valid {
		value := draft.CounterpartyID.Int64
		counterpartyID = &value
	}
	return MoneyRecordDraftInput{
		EntryMethod: draft.EntryMethod, Direction: draft.Direction, ScopeType: draft.ScopeType, Purpose: draft.Purpose,
		AmountMinor: strconv.FormatInt(draft.AmountMinor, 10), Currency: draft.Currency,
		EffectiveDate: draft.EffectiveDate.Time.Format("2006-01-02"), MoneyAccountID: moneyAccountID,
		DestinationAccountID: destinationAccountID, CategoryID: categoryID, CounterpartyID: counterpartyID,
		CounterpartyName: draft.CounterpartyName.String, Description: draft.Description.String, Reference: draft.Reference.String,
		Tags: draft.Tags, Payload: draft.Payload, AIMetadata: draft.AiMetadata, ClientCommandID: draft.ClientCommandID.String,
	}
}

func buildMoneyRecordPreview(draft db.MoneyRecordDraft, validationErr error) MoneyRecordPreview {
	amount := FormatMinorToMajor(draft.AmountMinor, int(draft.CurrencyExponent))
	// Keep collection fields as empty JSON arrays rather than null. The web client
	// renders these as lists and an empty, valid preview must not require a special case.
	preview := MoneyRecordPreview{
		DraftID:           strconv.FormatInt(draft.ID, 10),
		Version:           draft.Version,
		CanConfirm:        validationErr == nil,
		AccountingEffects: []string{},
		Warnings:          []string{},
	}
	accountText := "the selected account"
	switch draft.Direction {
	case "money_in":
		preview.BalanceEffect = fmt.Sprintf("%s %s will enter %s.", draft.Currency, amount, accountText)
		preview.AccountingEffects = []string{fmt.Sprintf("Cash or bank increases by %s %s.", draft.Currency, amount), purposePreviewText(draft, true)}
	case "money_out":
		preview.BalanceEffect = fmt.Sprintf("%s %s will leave %s.", draft.Currency, amount, accountText)
		preview.AccountingEffects = []string{fmt.Sprintf("Cash or bank decreases by %s %s.", draft.Currency, amount), purposePreviewText(draft, false)}
	case "transfer":
		preview.BalanceEffect = fmt.Sprintf("%s %s will move between your accounts.", draft.Currency, amount)
		preview.AccountingEffects = []string{"Income and expense totals will not change."}
	}
	if validationErr != nil {
		preview.Warnings = append(preview.Warnings, validationErr.Error())
	}
	if draft.EntryMethod == "ai_assisted" {
		preview.Warnings = append(preview.Warnings, "AI suggestions are untrusted until you review and confirm this record.")
	}
	if draft.State == "needs_review" {
		preview.Warnings = append(preview.Warnings, "This draft is marked for review.")
	}
	return preview
}

func purposePreviewText(draft db.MoneyRecordDraft, incoming bool) string {
	switch draft.Purpose {
	case "customer_advance":
		return "It will be recorded as a customer deposit liability, not sales income."
	case "supplier_advance":
		return "It will be recorded as a supplier advance, not an expense yet."
	case "not_yet_known":
		if draft.ScopeType == "business" && incoming {
			return "It will be held as an unidentified receipt until resolved."
		}
		if draft.ScopeType == "business" {
			return "It will be held in payments clearing until resolved."
		}
		return "It will remain visibly unclassified until resolved."
	case "owner_capital":
		return "It will increase owner capital, not revenue."
	case "owner_drawing":
		return "It will be recorded as an owner drawing, not a business expense."
	default:
		return "The category and purpose will determine the matching accounting effect."
	}
}

func (s *Service) createPurposeAwareLedger(ctx context.Context, qtx *db.Queries, workspaceID int64, transaction db.MoneyTransaction, sourceAccount db.MoneyAccount, scopeType string) (*db.LedgerEntry, []db.LedgerLine, error) {
	if transaction.Direction == "transfer" {
		return s.createBalancedLedger(ctx, qtx, workspaceID, transaction, sourceAccount)
	}
	entry, err := qtx.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID: workspaceID, SourceType: "money_transaction", SourceID: transaction.ID,
		EntryDate: transaction.EffectiveDate, Currency: transaction.Currency, CurrencyExponent: transaction.CurrencyExponent,
		Description: transaction.Notes,
	})
	if err != nil {
		return nil, nil, err
	}
	counterClass := purposeCounterClass(scopeType, transaction.Direction, transaction.Purpose)
	var lines []db.LedgerLine
	if transaction.Direction == "money_in" {
		debit, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountID: transaction.MoneyAccountID, AccountClass: "asset", DebitMinor: transaction.AmountMinor, Description: optionalPgText("Money received")})
		if err != nil {
			return nil, nil, err
		}
		credit, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: counterClass, CreditMinor: transaction.AmountMinor, Description: optionalPgText("Purpose: " + transaction.Purpose)})
		if err != nil {
			return nil, nil, err
		}
		lines = []db.LedgerLine{debit, credit}
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{ID: sourceAccount.ID, WorkspaceID: workspaceID, CurrentBalanceMinor: transaction.AmountMinor})
	} else {
		debit, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: counterClass, DebitMinor: transaction.AmountMinor, Description: optionalPgText("Purpose: " + transaction.Purpose)})
		if err != nil {
			return nil, nil, err
		}
		credit, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountID: transaction.MoneyAccountID, AccountClass: "asset", CreditMinor: transaction.AmountMinor, Description: optionalPgText("Money paid")})
		if err != nil {
			return nil, nil, err
		}
		lines = []db.LedgerLine{debit, credit}
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{ID: sourceAccount.ID, WorkspaceID: workspaceID, CurrentBalanceMinor: -transaction.AmountMinor})
	}
	if err != nil {
		return nil, nil, err
	}
	if len(lines) != 2 || lines[0].DebitMinor+lines[1].DebitMinor != lines[0].CreditMinor+lines[1].CreditMinor {
		return nil, nil, ErrLedgerUnbalanced
	}
	return &entry, lines, nil
}

func purposeCounterClass(scopeType, direction, purpose string) string {
	if direction == "money_in" {
		switch purpose {
		case "customer_advance", "loan_proceeds":
			return "liability"
		case "owner_capital":
			return "equity"
		case "refund", "supplier_refund":
			return "expense"
		case "not_yet_known":
			if scopeType == "business" {
				return "liability"
			}
		}
		return "revenue"
	}
	switch purpose {
	case "supplier_advance", "asset_purchase", "investment_contribution", "loan_lent":
		return "asset"
	case "loan_repayment", "tax_payment":
		return "liability"
	case "owner_drawing":
		return "equity"
	case "customer_refund":
		return "revenue"
	case "not_yet_known":
		if scopeType == "business" {
			return "asset"
		}
	}
	return "expense"
}
