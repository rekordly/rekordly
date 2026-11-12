package finance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/ai"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrAINotEntitled             = errors.New("AI_NOT_ENTITLED")
	ErrAICreditLimitReached      = errors.New("AI_CREDIT_LIMIT_REACHED")
	ErrAIRateLimited             = errors.New("AI_RATE_LIMITED")
	ErrAIInputTooLarge           = errors.New("AI_INPUT_TOO_LARGE")
	ErrAIProviderTimeout         = errors.New("AI_PROVIDER_TIMEOUT")
	ErrAIStructuredOutputInvalid = errors.New("AI_STRUCTURED_OUTPUT_INVALID")
	ErrAIDraftRequiresReview     = errors.New("AI_DRAFT_REQUIRES_REVIEW")
)

type CreateAIMoneyDraftInput struct {
	Narration     string `json:"narration" binding:"required"`
	ScopeHint     string `json:"scope_hint"`
	DirectionHint string `json:"direction_hint"`
	Async         bool   `json:"async"`
}

type AIUsageSummary struct {
	PlanEntitled       bool   `json:"plan_entitled"`
	MonthlyCreditLimit int32  `json:"monthly_credit_limit"`
	CreditsUsed        int32  `json:"credits_used"`
	CreditsReserved    int32  `json:"credits_reserved"`
	CreditsRemaining   int32  `json:"credits_remaining"`
	PerUserDailyLimit  int32  `json:"per_user_daily_limit"`
	UserDailyUsed      int64  `json:"user_daily_used"`
	DefaultProvider    string `json:"default_provider"`
	ProviderConfigured bool   `json:"provider_configured"`
}

type AIMoneyDraftResult struct {
	Request db.AiRequest `json:"request"`
	Drafts  []db.AiDraft `json:"drafts"`
	Job     *db.Job      `json:"job,omitempty"`
}

type UpdateAIDraftInput struct {
	Scope          *string `json:"scope"`
	Direction      *string `json:"direction"`
	Purpose        *string `json:"purpose"`
	AmountMajor    *string `json:"amount_major"`
	Currency       *string `json:"currency"`
	EffectiveDate  *string `json:"effective_date"`
	AccountID      *int64  `json:"account_id"`
	CategoryID     *int64  `json:"category_id"`
	CounterpartyID *int64  `json:"counterparty_id"`
	Description    *string `json:"description"`
}

var complexManualFlowPurposes = map[string]string{
	"invoice_allocation": "/invoices",
	"bill_allocation":    "/procurement",
	"deposit_advance":    "/wallets",
	"loan_split":         "/loans",
	"mixed_allocation":   "/transactions/new",
	"inventory":          "/inventory",
	"refund_return":      "/sales",
	"tax_wht":            "/reports/tax",
	"opening_balance":    "/accounts",
	"foreign_currency":   "/transactions/new",
	"reversal":           "/ledger",
}

func (s *Service) GetAIUsage(ctx context.Context, workspaceID, userID int64) (AIUsageSummary, error) {
	quota, err := s.queries.EnsureWorkspaceAIQuota(ctx, workspaceID)
	if err != nil {
		return AIUsageSummary{}, err
	}
	dailyUsed, err := s.queries.CountUserDailyAIRequests(ctx, db.CountUserDailyAIRequestsParams{
		WorkspaceID: workspaceID,
		UserID:      userID,
	})
	if err != nil {
		return AIUsageSummary{}, err
	}
	rem := quota.MonthlyCreditLimit - quota.CreditsUsed - quota.CreditsReserved
	if rem < 0 {
		rem = 0
	}
	return AIUsageSummary{
		PlanEntitled:       quota.PlanEntitled,
		MonthlyCreditLimit: quota.MonthlyCreditLimit,
		CreditsUsed:        quota.CreditsUsed,
		CreditsReserved:    quota.CreditsReserved,
		CreditsRemaining:   rem,
		PerUserDailyLimit:  quota.PerUserDailyLimit,
		UserDailyUsed:      dailyUsed,
		DefaultProvider:    "server-configured",
		ProviderConfigured: s.aiOrchestrator != nil,
	}, nil
}

// ParseAIMoneyDraft reserves 1 AI credit atomically, builds minimal workspace-scoped context,
// invokes the configured provider (or queues a job if Async=true), validates strict JSON,
// resolves aliases strictly inside workspaceID, and persists untrusted drafts only.
func (s *Service) ParseAIMoneyDraft(ctx context.Context, workspaceID, userID int64, idempKey string, in CreateAIMoneyDraftInput) (AIMoneyDraftResult, error) {
	idempKey = strings.TrimSpace(idempKey)
	if idempKey == "" {
		idempKey = fmt.Sprintf("ai-%d-%d-%d", workspaceID, userID, time.Now().UnixNano())
	}

	// Idempotent replay: return existing request + drafts without charging credits twice.
	if existing, err := s.queries.GetAIRequestByIdempotency(ctx, db.GetAIRequestByIdempotencyParams{
		WorkspaceID:    workspaceID,
		IdempotencyKey: idempKey,
	}); err == nil {
		drafts, _ := s.queries.ListAIDraftsByRequest(ctx, db.ListAIDraftsByRequestParams{
			WorkspaceID: workspaceID,
			AiRequestID: existing.ID,
		})
		return AIMoneyDraftResult{Request: existing, Drafts: drafts}, nil
	} else if !isNoRows(err) {
		return AIMoneyDraftResult{}, err
	}

	cleanedNarration, err := ai.SanitizePromptInput(in.Narration, 2000)
	if err != nil {
		if ai.ClassifyError(err) == ai.FailureInputTooLarge {
			return AIMoneyDraftResult{}, ErrAIInputTooLarge
		}
		return AIMoneyDraftResult{}, err
	}

	quota, err := s.queries.EnsureWorkspaceAIQuota(ctx, workspaceID)
	if err != nil {
		return AIMoneyDraftResult{}, err
	}
	if !quota.PlanEntitled {
		return AIMoneyDraftResult{}, ErrAINotEntitled
	}
	dailyUsed, err := s.queries.CountUserDailyAIRequests(ctx, db.CountUserDailyAIRequestsParams{
		WorkspaceID: workspaceID,
		UserID:      userID,
	})
	if err != nil {
		return AIMoneyDraftResult{}, err
	}
	if dailyUsed >= int64(quota.PerUserDailyLimit) {
		return AIMoneyDraftResult{}, ErrAIRateLimited
	}

	// Atomic credit reservation prevents concurrent requests from exceeding the limit.
	if _, err := s.queries.ReserveWorkspaceAICredit(ctx, db.ReserveWorkspaceAICreditParams{
		WorkspaceID:     workspaceID,
		CreditsReserved: 1,
	}); err != nil {
		if isNoRows(err) {
			return AIMoneyDraftResult{}, ErrAICreditLimitReached
		}
		return AIMoneyDraftResult{}, err
	}

	mode := "sync"
	initStatus := "running"
	if in.Async {
		mode = "async"
		initStatus = "queued"
	}

	// Store only a redacted/truncated summary (never full raw secrets or unredacted prompt blobs).
	redacted := cleanedNarration
	if len([]rune(redacted)) > 120 {
		redacted = string([]rune(redacted)[:120]) + "..."
	}

	reqRow, err := s.queries.CreateAIRequest(ctx, db.CreateAIRequestParams{
		WorkspaceID:     workspaceID,
		UserID:          userID,
		IdempotencyKey:  idempKey,
		Mode:            mode,
		Status:          initStatus,
		InputCharCount:  int32(len([]rune(cleanedNarration))),
		RedactedSummary: redacted,
	})
	if err != nil {
		_, _ = s.queries.ReleaseWorkspaceAICredit(ctx, db.ReleaseWorkspaceAICreditParams{WorkspaceID: workspaceID, CreditsReserved: 1})
		return AIMoneyDraftResult{}, err
	}

	resRow, err := s.queries.CreateAIUsageReservation(ctx, db.CreateAIUsageReservationParams{
		WorkspaceID:     workspaceID,
		UserID:          userID,
		AiRequestID:     pgtype.Int8{Int64: reqRow.ID, Valid: true},
		IdempotencyKey:  "res:" + idempKey,
		CreditsReserved: 1,
	})
	if err != nil {
		_, _ = s.queries.ReleaseWorkspaceAICredit(ctx, db.ReleaseWorkspaceAICreditParams{WorkspaceID: workspaceID, CreditsReserved: 1})
		return AIMoneyDraftResult{}, err
	}

	if in.Async {
		payloadBytes, _ := json.Marshal(map[string]any{
			"ai_request_id":  reqRow.ID,
			"reservation_id": resRow.ID,
			"narration":      cleanedNarration,
			"scope_hint":     in.ScopeHint,
			"direction_hint": in.DirectionHint,
		})
		jobRow, jErr := s.queries.CreateJob(ctx, db.CreateJobParams{
			WorkspaceID:    workspaceID,
			UserID:         pgtype.Int8{Int64: userID, Valid: true},
			JobType:        "ai_parse_money_draft",
			SourceType:     "ai_request",
			SourceID:       reqRow.ID,
			Payload:        payloadBytes,
			Priority:       50,
			MaxAttempts:    3,
			TimeoutSeconds: 60,
			IdempotencyKey: pgtype.Text{String: "ai-job:" + idempKey, Valid: true},
		})
		if jErr != nil {
			s.releaseReservation(ctx, workspaceID, resRow.ID)
			return AIMoneyDraftResult{}, jErr
		}
		updatedReq, _ := s.queries.UpdateAIRequestResult(ctx, db.UpdateAIRequestResultParams{
			ID:          reqRow.ID,
			WorkspaceID: workspaceID,
			Status:      "queued",
			JobID:       pgtype.Int8{Int64: jobRow.ID, Valid: true},
		})
		return AIMoneyDraftResult{Request: updatedReq, Drafts: []db.AiDraft{}, Job: &jobRow}, nil
	}

	return s.executeAIParse(ctx, workspaceID, userID, reqRow, resRow.ID, cleanedNarration, in.ScopeHint, in.DirectionHint)
}

func (s *Service) executeAIParse(
	ctx context.Context,
	workspaceID, userID int64,
	reqRow db.AiRequest,
	reservationID int64,
	narration, scopeHint, directionHint string,
) (AIMoneyDraftResult, error) {
	if s.aiOrchestrator == nil {
		s.releaseReservation(ctx, workspaceID, reservationID)
		updated, _ := s.queries.UpdateAIRequestResult(ctx, db.UpdateAIRequestResultParams{
			ID:           reqRow.ID,
			WorkspaceID:  workspaceID,
			Status:       "failed",
			FailureClass: pgtype.Text{String: string(ai.FailureUnavailable), Valid: true},
		})
		return AIMoneyDraftResult{Request: updated}, &ai.ProviderError{
			Provider: "orchestrator", Class: ai.FailureUnavailable, Retryable: true, Message: "ai provider unavailable",
		}
	}

	minCtx, accMap, catMap, cpMap, wsMeta, err := s.buildMinimalAIContext(ctx, workspaceID, narration, scopeHint, directionHint)
	if err != nil {
		s.releaseReservation(ctx, workspaceID, reservationID)
		return AIMoneyDraftResult{}, err
	}

	orchRes, callErr := s.aiOrchestrator.Parse(ctx, minCtx)
	for _, att := range orchRes.Attempts {
		_, _ = s.queries.CreateAIProviderUsageLog(ctx, db.CreateAIProviderUsageLogParams{
			WorkspaceID:     workspaceID,
			AiRequestID:     pgtype.Int8{Int64: reqRow.ID, Valid: true},
			Provider:        att.Meta.Provider,
			Model:           att.Meta.Model,
			LatencyMs:       int32(att.Meta.LatencyMs),
			InputTokens:     int32(att.Meta.InputTokens),
			OutputTokens:    int32(att.Meta.OutputTokens),
			StructuredValid: att.Meta.StructuredValid,
			FailureClass:    pgtype.Text{String: string(att.Meta.FailureClass), Valid: att.Meta.FailureClass != ""},
			IsFallback:      att.Meta.IsFallback,
		})
	}

	lastMeta := orchRes.Response.Meta
	if len(orchRes.Attempts) > 0 && lastMeta.Provider == "" {
		lastMeta = orchRes.Attempts[len(orchRes.Attempts)-1].Meta
	}

	if callErr != nil {
		s.releaseReservation(ctx, workspaceID, reservationID)
		cls := ai.ClassifyError(callErr)
		updated, _ := s.queries.UpdateAIRequestResult(ctx, db.UpdateAIRequestResultParams{
			ID:              reqRow.ID,
			WorkspaceID:     workspaceID,
			Status:          "failed",
			Provider:        pgtype.Text{String: lastMeta.Provider, Valid: lastMeta.Provider != ""},
			Model:           pgtype.Text{String: lastMeta.Model, Valid: lastMeta.Model != ""},
			LatencyMs:       int32(lastMeta.LatencyMs),
			InputTokens:     int32(lastMeta.InputTokens),
			OutputTokens:    int32(lastMeta.OutputTokens),
			StructuredValid: false,
			FailureClass:    pgtype.Text{String: string(cls), Valid: true},
		})
		switch cls {
		case ai.FailureTimeout:
			return AIMoneyDraftResult{Request: updated}, ErrAIProviderTimeout
		case ai.FailureInvalidOutput:
			return AIMoneyDraftResult{Request: updated}, ErrAIStructuredOutputInvalid
		case ai.FailureInputTooLarge:
			return AIMoneyDraftResult{Request: updated}, ErrAIInputTooLarge
		default:
			return AIMoneyDraftResult{Request: updated}, callErr
		}
	}

	// Provider succeeded -> consume reservation exactly once.
	s.consumeReservation(ctx, workspaceID, reservationID)

	updatedReq, _ := s.queries.UpdateAIRequestResult(ctx, db.UpdateAIRequestResultParams{
		ID:              reqRow.ID,
		WorkspaceID:     workspaceID,
		Status:          "succeeded",
		Provider:        pgtype.Text{String: lastMeta.Provider, Valid: lastMeta.Provider != ""},
		Model:           pgtype.Text{String: lastMeta.Model, Valid: lastMeta.Model != ""},
		LatencyMs:       int32(lastMeta.LatencyMs),
		InputTokens:     int32(lastMeta.InputTokens),
		OutputTokens:    int32(lastMeta.OutputTokens),
		StructuredValid: true,
	})

	drafts := make([]db.AiDraft, 0, len(orchRes.Response.Records))
	for _, rec := range orchRes.Response.Records {
		d, dErr := s.persistValidatedAIDraft(ctx, workspaceID, userID, reqRow.ID, rec, accMap, catMap, cpMap, wsMeta)
		if dErr == nil {
			drafts = append(drafts, d)
		}
	}

	return AIMoneyDraftResult{Request: updatedReq, Drafts: drafts}, nil
}

type wsContextMeta struct {
	Kind         string
	BaseCurrency string
	Today        string
}

func (s *Service) buildMinimalAIContext(
	ctx context.Context,
	workspaceID int64,
	narration, scopeHint, directionHint string,
) (ai.ParseMoneyDraftRequest, map[string]int64, map[string]int64, map[string]int64, wsContextMeta, error) {
	var wsKind, wsCurrency, wsTimezone string
	if err := s.pool.QueryRow(ctx, `SELECT kind, base_currency, timezone FROM workspaces WHERE id = $1`, workspaceID).Scan(&wsKind, &wsCurrency, &wsTimezone); err != nil {
		return ai.ParseMoneyDraftRequest{}, nil, nil, nil, wsContextMeta{}, err
	}
	today := time.Now().UTC().Format("2006-01-02")

	accounts, _ := s.queries.ListMoneyAccounts(ctx, db.ListMoneyAccountsParams{WorkspaceID: workspaceID})
	accAliases := make([]ai.AliasOption, 0, 12)
	accMap := make(map[string]int64)
	for i, a := range accounts {
		if !a.IsActive || i >= 12 {
			continue
		}
		alias := fmt.Sprintf("acc_%d", i+1)
		accMap[alias] = a.ID
		accAliases = append(accAliases, ai.AliasOption{Alias: alias, Label: a.Name, Kind: a.AccountType})
	}

	cats, _ := s.queries.ListCategories(ctx, db.ListCategoriesParams{WorkspaceID: workspaceID})
	catAliases := make([]ai.AliasOption, 0, 20)
	catMap := make(map[string]int64)
	for i, c := range cats {
		if !c.IsActive || i >= 20 {
			continue
		}
		alias := fmt.Sprintf("cat_%d", i+1)
		catMap[alias] = c.ID
		catAliases = append(catAliases, ai.AliasOption{Alias: alias, Label: c.Name, Kind: c.Direction})
	}

	cps, _ := s.queries.ListCounterparties(ctx, db.ListCounterpartiesParams{WorkspaceID: workspaceID})
	cpAliases := make([]ai.AliasOption, 0, 15)
	cpMap := make(map[string]int64)
	for i, cp := range cps {
		if !cp.IsActive || i >= 15 {
			continue
		}
		alias := fmt.Sprintf("cp_%d", i+1)
		cpMap[alias] = cp.ID
		cpAliases = append(cpAliases, ai.AliasOption{Alias: alias, Label: cp.Name, Kind: cp.PartyType})
	}

	meta := wsContextMeta{Kind: wsKind, BaseCurrency: wsCurrency, Today: today}
	return ai.ParseMoneyDraftRequest{
		WorkspaceKind:       wsKind,
		BaseCurrency:        wsCurrency,
		Timezone:            wsTimezone,
		CurrentDate:         today,
		Narration:           narration,
		ScopeHint:           scopeHint,
		DirectionHint:       directionHint,
		AccountAliases:      accAliases,
		CategoryAliases:     catAliases,
		CounterpartyAliases: cpAliases,
	}, accMap, catMap, cpMap, meta, nil
}

func (s *Service) persistValidatedAIDraft(
	ctx context.Context,
	workspaceID, userID, aiRequestID int64,
	rec ai.DraftRecord,
	accMap, catMap, cpMap map[string]int64,
	wsMeta wsContextMeta,
) (db.AiDraft, error) {
	scope := strings.ToLower(strings.TrimSpace(rec.Scope))
	if scope != "personal" && scope != "business" {
		scope = "unknown"
	}
	direction := strings.ToLower(strings.TrimSpace(rec.Direction))
	if direction != "money_in" && direction != "money_out" && direction != "transfer" {
		direction = "unknown"
	}
	purpose := strings.ToLower(strings.TrimSpace(rec.Purpose))
	if purpose == "" {
		purpose = "unknown"
	}

	currency := strings.ToUpper(strings.TrimSpace(rec.Currency))
	if len(currency) != 3 {
		currency = wsMeta.BaseCurrency
	}
	exp := int16(CurrencyExponent(currency))

	missing := append([]string{}, rec.MissingFields...)
	warnings := append([]string{}, rec.Warnings...)

	var amountMinor int64
	amountMajor := strings.TrimSpace(rec.AmountMajor)
	if amountMajor != "" {
		parsedMinor, err := ParseMajorToMinor(amountMajor, int(exp))
		if err != nil || parsedMinor <= 0 {
			warnings = append(warnings, "invalid_amount_cleared")
			missing = append(missing, "amount")
			amountMajor = ""
		} else {
			amountMinor = parsedMinor
		}
	} else {
		missing = append(missing, "amount")
	}

	var effDate pgtype.Date
	if strings.TrimSpace(rec.EffectiveDate) != "" {
		if dt, err := parseDateStrict(rec.EffectiveDate); err == nil {
			effDate = pgtype.Date{Time: dt, Valid: true}
		} else {
			warnings = append(warnings, "invalid_date_cleared")
			missing = append(missing, "effective_date")
		}
	} else {
		missing = append(missing, "effective_date")
	}

	// Strict alias resolution: reject any ID/alias not in authorized workspace map.
	var accountID pgtype.Int8
	var accountAlias pgtype.Text
	if rec.AccountAlias != nil && strings.TrimSpace(*rec.AccountAlias) != "" {
		al := strings.TrimSpace(*rec.AccountAlias)
		if id, ok := accMap[al]; ok {
			accountID = pgtype.Int8{Int64: id, Valid: true}
			accountAlias = pgtype.Text{String: al, Valid: true}
		} else {
			warnings = append(warnings, "unknown_or_cross_workspace_account_alias_rejected")
			missing = append(missing, "account")
		}
	} else {
		missing = append(missing, "account")
	}

	var categoryID pgtype.Int8
	var categoryAlias pgtype.Text
	if rec.CategoryAlias != nil && strings.TrimSpace(*rec.CategoryAlias) != "" {
		al := strings.TrimSpace(*rec.CategoryAlias)
		if id, ok := catMap[al]; ok {
			categoryID = pgtype.Int8{Int64: id, Valid: true}
			categoryAlias = pgtype.Text{String: al, Valid: true}
		} else {
			warnings = append(warnings, "unknown_or_cross_workspace_category_alias_rejected")
		}
	}

	var cpID pgtype.Int8
	var cpAlias pgtype.Text
	if rec.CounterpartyAlias != nil && strings.TrimSpace(*rec.CounterpartyAlias) != "" {
		al := strings.TrimSpace(*rec.CounterpartyAlias)
		if id, ok := cpMap[al]; ok {
			cpID = pgtype.Int8{Int64: id, Valid: true}
			cpAlias = pgtype.Text{String: al, Valid: true}
		} else {
			warnings = append(warnings, "unknown_or_cross_workspace_counterparty_alias_rejected")
		}
	}

	routeFlow := strings.TrimSpace(rec.RouteToManualFlow)
	if routeFlow == "" {
		if target, ok := complexManualFlowPurposes[purpose]; ok {
			routeFlow = target
		}
	}
	if scope == "unknown" {
		missing = append(missing, "scope")
	}
	if direction == "unknown" {
		missing = append(missing, "direction")
	}
	for k, sig := range rec.Fields {
		if sig.Confidence == "low" || sig.Confidence == "missing" {
			missing = append(missing, k)
		}
	}
	missing = uniqueStrings(missing)
	warnings = uniqueStrings(warnings)

	status := "draft"
	if len(missing) > 0 || len(rec.ClarificationHints) > 0 || routeFlow != "" {
		status = "needs_review"
	}

	confJSON, _ := json.Marshal(rec.Fields)
	missJSON, _ := json.Marshal(missing)
	warnJSON, _ := json.Marshal(warnings)
	clarJSON, _ := json.Marshal(rec.ClarificationHints)

	return s.queries.CreateAIDraft(ctx, db.CreateAIDraftParams{
		WorkspaceID:          workspaceID,
		UserID:               userID,
		AiRequestID:          aiRequestID,
		SchemaVersion:        ai.SchemaVersionV1,
		Scope:                scope,
		Direction:            direction,
		Purpose:              purpose,
		AmountMajor:          amountMajor,
		AmountMinor:          amountMinor,
		Currency:             currency,
		CurrencyExponent:     exp,
		EffectiveDate:        effDate,
		AccountID:            accountID,
		AccountAlias:         accountAlias,
		CategoryID:           categoryID,
		CategoryAlias:        categoryAlias,
		CounterpartyID:       cpID,
		CounterpartyAlias:    cpAlias,
		Description:          strings.TrimSpace(rec.Description),
		FieldConfidence:      confJSON,
		MissingFields:        missJSON,
		Warnings:             warnJSON,
		ClarificationOptions: clarJSON,
		RouteToManualFlow:    pgtype.Text{String: routeFlow, Valid: routeFlow != ""},
		Status:               status,
	})
}

func (s *Service) GetAIRequest(ctx context.Context, workspaceID, requestID int64) (AIMoneyDraftResult, error) {
	reqRow, err := s.queries.GetAIRequestByID(ctx, db.GetAIRequestByIDParams{ID: requestID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return AIMoneyDraftResult{}, ErrNotFound
	}
	if err != nil {
		return AIMoneyDraftResult{}, err
	}
	drafts, err := s.queries.ListAIDraftsByRequest(ctx, db.ListAIDraftsByRequestParams{
		WorkspaceID: workspaceID,
		AiRequestID: reqRow.ID,
	})
	if err != nil {
		return AIMoneyDraftResult{}, err
	}
	return AIMoneyDraftResult{Request: reqRow, Drafts: drafts}, nil
}

func (s *Service) ListAIDrafts(ctx context.Context, workspaceID int64, statusFilter string) ([]db.AiDraft, error) {
	var sf pgtype.Text
	if strings.TrimSpace(statusFilter) != "" {
		sf = pgtype.Text{String: strings.TrimSpace(statusFilter), Valid: true}
	}
	return s.queries.ListAIDraftsByWorkspace(ctx, db.ListAIDraftsByWorkspaceParams{
		WorkspaceID: workspaceID,
		Status:      sf,
		Limit:       50,
	})
}

func (s *Service) UpdateAIDraft(ctx context.Context, workspaceID, draftID int64, in UpdateAIDraftInput) (db.AiDraft, error) {
	cur, err := s.queries.GetAIDraftByID(ctx, db.GetAIDraftByIDParams{ID: draftID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.AiDraft{}, ErrNotFound
	}
	if err != nil {
		return db.AiDraft{}, err
	}

	scope := cur.Scope
	if in.Scope != nil {
		scope = strings.ToLower(strings.TrimSpace(*in.Scope))
	}
	dir := cur.Direction
	if in.Direction != nil {
		dir = strings.ToLower(strings.TrimSpace(*in.Direction))
	}
	purpose := cur.Purpose
	if in.Purpose != nil {
		purpose = strings.ToLower(strings.TrimSpace(*in.Purpose))
	}
	currency := cur.Currency
	if in.Currency != nil && len(strings.TrimSpace(*in.Currency)) == 3 {
		currency = strings.ToUpper(strings.TrimSpace(*in.Currency))
	}
	exp := int16(CurrencyExponent(currency))

	amtMajor := cur.AmountMajor
	amtMinor := cur.AmountMinor
	if in.AmountMajor != nil {
		amtMajor = strings.TrimSpace(*in.AmountMajor)
		m, err := ParseMajorToMinor(amtMajor, int(exp))
		if err != nil || m <= 0 {
			return db.AiDraft{}, ErrInvalidAmount
		}
		amtMinor = m
	}

	effDate := cur.EffectiveDate
	if in.EffectiveDate != nil {
		dt, err := parseDateStrict(*in.EffectiveDate)
		if err != nil {
			return db.AiDraft{}, err
		}
		effDate = pgtype.Date{Time: dt, Valid: true}
	}

	accID := cur.AccountID
	if in.AccountID != nil {
		acc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: *in.AccountID, WorkspaceID: workspaceID})
		if isNoRows(err) || !acc.IsActive {
			return db.AiDraft{}, ErrForbiddenAccount
		}
		if err != nil {
			return db.AiDraft{}, err
		}
		accID = pgtype.Int8{Int64: acc.ID, Valid: true}
	}

	catID := cur.CategoryID
	if in.CategoryID != nil {
		cat, err := s.queries.GetCategoryByID(ctx, db.GetCategoryByIDParams{ID: *in.CategoryID, WorkspaceID: workspaceID})
		if isNoRows(err) || !cat.IsActive {
			return db.AiDraft{}, ErrForbiddenCategory
		}
		if err != nil {
			return db.AiDraft{}, err
		}
		catID = pgtype.Int8{Int64: cat.ID, Valid: true}
	}

	cpID := cur.CounterpartyID
	if in.CounterpartyID != nil {
		cpID = pgtype.Int8{Int64: *in.CounterpartyID, Valid: true}
	}

	desc := cur.Description
	if in.Description != nil {
		desc = strings.TrimSpace(*in.Description)
	}

	var missing []string
	if amtMinor <= 0 {
		missing = append(missing, "amount")
	}
	if !effDate.Valid {
		missing = append(missing, "effective_date")
	}
	if !accID.Valid {
		missing = append(missing, "account")
	}
	if scope != "personal" && scope != "business" {
		missing = append(missing, "scope")
	}
	if dir != "money_in" && dir != "money_out" && dir != "transfer" {
		missing = append(missing, "direction")
	}

	routeFlow := ""
	if target, ok := complexManualFlowPurposes[purpose]; ok {
		routeFlow = target
	}

	status := "draft"
	if len(missing) > 0 || routeFlow != "" {
		status = "needs_review"
	}

	missJSON, _ := json.Marshal(missing)
	return s.queries.UpdateAIDraftFields(ctx, db.UpdateAIDraftFieldsParams{
		ID:                draftID,
		WorkspaceID:       workspaceID,
		Scope:             scope,
		Direction:         dir,
		Purpose:           purpose,
		AmountMajor:       amtMajor,
		AmountMinor:       amtMinor,
		Currency:          currency,
		CurrencyExponent:  exp,
		EffectiveDate:     effDate,
		AccountID:         accID,
		CategoryID:        catID,
		CounterpartyID:    cpID,
		Description:       desc,
		MissingFields:     missJSON,
		Warnings:          cur.Warnings,
		RouteToManualFlow: pgtype.Text{String: routeFlow, Valid: routeFlow != ""},
		Status:            status,
	})
}

func (s *Service) PreviewAIDraftEffect(ctx context.Context, workspaceID, draftID int64) (PostingPreviewResult, error) {
	d, err := s.queries.GetAIDraftByID(ctx, db.GetAIDraftByIDParams{ID: draftID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return PostingPreviewResult{}, ErrNotFound
	}
	if err != nil {
		return PostingPreviewResult{}, err
	}
	if d.AmountMinor <= 0 || !d.EffectiveDate.Valid {
		return PostingPreviewResult{}, ErrAIDraftRequiresReview
	}

	templateKey := "personal_expense"
	if d.Direction == "money_in" {
		templateKey = "business_cash_sale"
	}

	return s.PreviewTemplatePosting(ctx, workspaceID, TemplatePostingRequest{
		TemplateKey: templateKey,
		SourceType:  "money_transaction",
		SourceID:    d.ID,
		EntryDate:   d.EffectiveDate.Time.Format("2006-01-02"),
		Currency:    d.Currency,
		AmountMinor: d.AmountMinor,
		Description: d.Description,
	})
}

// ConfirmAIDraft validates readiness and delegates exclusively to deterministic CreateTransaction.
func (s *Service) ConfirmAIDraft(ctx context.Context, workspaceID, userID, draftID int64, idempKey string) (TransactionDetail, error) {
	d, err := s.queries.GetAIDraftByID(ctx, db.GetAIDraftByIDParams{ID: draftID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return TransactionDetail{}, ErrNotFound
	}
	if err != nil {
		return TransactionDetail{}, err
	}
	if d.Status == "confirmed" && d.ConfirmedRecordID.Valid {
		return s.GetTransaction(ctx, workspaceID, d.ConfirmedRecordID.Int64)
	}
	if d.Status != "draft" || d.AmountMinor <= 0 || !d.EffectiveDate.Valid || !d.AccountID.Valid || (d.RouteToManualFlow.Valid && d.RouteToManualFlow.String != "") {
		return TransactionDetail{}, ErrAIDraftRequiresReview
	}
	if d.Direction != "money_in" && d.Direction != "money_out" {
		return TransactionDetail{}, ErrAIDraftRequiresReview
	}

	if idempKey == "" {
		idempKey = fmt.Sprintf("confirm-ai-draft-%d-%d", workspaceID, d.ID)
	}

	var catID *int64
	if d.CategoryID.Valid {
		catID = &d.CategoryID.Int64
	}
	purpose := d.Purpose
	if purpose == "unknown" || purpose == "" {
		if d.Scope == "personal" {
			if d.Direction == "money_in" {
				purpose = "personal_income"
			} else {
				purpose = "personal_expense"
			}
		} else {
			if d.Direction == "money_in" {
				purpose = "business_income"
			} else {
				purpose = "business_direct_expense"
			}
		}
	}

	txDetail, err := s.CreateTransaction(ctx, workspaceID, userID, CreateTransactionInput{
		Direction:      d.Direction,
		Status:         "posted",
		AmountMinor:    d.AmountMinor,
		Currency:       d.Currency,
		EffectiveDate:  d.EffectiveDate.Time.Format("2006-01-02"),
		MoneyAccountID: d.AccountID.Int64,
		CategoryID:     catID,
		Purpose:        purpose,
		Notes:          d.Description,
		Reference:      fmt.Sprintf("ai-draft-%d", d.ID),
		IdempotencyKey: idempKey,
	})
	if err != nil {
		return TransactionDetail{}, err
	}

	_, _ = s.queries.MarkAIDraftConfirmed(ctx, db.MarkAIDraftConfirmedParams{
		ID:                  d.ID,
		WorkspaceID:         workspaceID,
		ConfirmedRecordType: pgtype.Text{String: "money_transaction", Valid: true},
		ConfirmedRecordID:   pgtype.Int8{Int64: txDetail.Transaction.ID, Valid: true},
	})
	return txDetail, nil
}

func (s *Service) DiscardAIDraft(ctx context.Context, workspaceID, draftID int64) (db.AiDraft, error) {
	d, err := s.queries.DiscardAIDraft(ctx, db.DiscardAIDraftParams{ID: draftID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.AiDraft{}, ErrNotFound
	}
	return d, err
}

func (s *Service) consumeReservation(ctx context.Context, workspaceID, reservationID int64) {
	if _, err := s.queries.SettleAIUsageReservation(ctx, db.SettleAIUsageReservationParams{
		ID:          reservationID,
		WorkspaceID: workspaceID,
		Status:      "consumed",
	}); err == nil {
		_, _ = s.queries.ConsumeWorkspaceAICredit(ctx, db.ConsumeWorkspaceAICreditParams{
			WorkspaceID:     workspaceID,
			CreditsReserved: 1,
		})
	}
}

func (s *Service) releaseReservation(ctx context.Context, workspaceID, reservationID int64) {
	if _, err := s.queries.SettleAIUsageReservation(ctx, db.SettleAIUsageReservationParams{
		ID:          reservationID,
		WorkspaceID: workspaceID,
		Status:      "released",
	}); err == nil {
		_, _ = s.queries.ReleaseWorkspaceAICredit(ctx, db.ReleaseWorkspaceAICreditParams{
			WorkspaceID:     workspaceID,
			CreditsReserved: 1,
		})
	}
}

func uniqueStrings(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, it := range items {
		it = strings.TrimSpace(it)
		if it == "" {
			continue
		}
		if _, ok := seen[it]; !ok {
			seen[it] = struct{}{}
			out = append(out, it)
		}
	}
	return out
}
