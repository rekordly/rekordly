package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

// ---------------- Investments ----------------

type CreateInvestmentInput struct {
	Name            string `json:"name" binding:"required"`
	InvestmentType  string `json:"investment_type" binding:"required"` // shares_funds, fixed_income, crypto, cooperative, other
	InstitutionName string `json:"institution_name"`
	Currency        string `json:"currency"`
	Notes           string `json:"notes"`
	IdempotencyKey  string `json:"idempotency_key"`
}

type RecordInvestmentEventInput struct {
	InvestmentID   int64  `json:"investment_id" binding:"required"`
	EventType      string `json:"event_type" binding:"required"` // purchase, contribution, income, disposal, opening
	EffectiveDate  string `json:"effective_date" binding:"required"`
	AmountMinor    int64  `json:"amount_minor"`
	Amount         string `json:"amount"`
	UnitsDelta     string `json:"units_delta"` // decimal string, e.g. "10.5"
	MoneyAccountID *int64 `json:"money_account_id"`
	CostBasisMinor *int64 `json:"cost_basis_minor"` // optional explicit basis for partial disposal
	Notes          string `json:"notes"`
	IdempotencyKey string `json:"idempotency_key"`
}

type CreateValuationInput struct {
	ValuationDate string `json:"valuation_date" binding:"required"`
	ValueMinor    int64  `json:"value_minor"`
	Value         string `json:"value"`
	Source        string `json:"source"`
	Notes         string `json:"notes"`
}

type InvestmentDetail struct {
	Investment db.Investment            `json:"investment"`
	Events     []db.InvestmentEvent     `json:"events"`
	Valuations []db.InvestmentValuation `json:"valuations"`
}

func (s *Service) CreateInvestment(ctx context.Context, workspaceID, userID int64, idempKey string, in CreateInvestmentInput) (InvestmentDetail, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return InvestmentDetail{}, errors.New("investment name is required")
	}
	invType := strings.TrimSpace(in.InvestmentType)
	switch invType {
	case "shares_funds", "fixed_income", "crypto", "cooperative", "other":
	default:
		return InvestmentDetail{}, errors.New("invalid investment_type")
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := int32(CurrencyExponent(currency))

	if idempKey != "" {
		existing, err := s.queries.GetInvestmentByIdempotency(ctx, db.GetInvestmentByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			return s.GetInvestmentDetail(ctx, workspaceID, existing.ID)
		}
		if !isNoRows(err) {
			return InvestmentDetail{}, err
		}
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	inv, err := s.queries.CreateInvestment(ctx, db.CreateInvestmentParams{
		WorkspaceID:      workspaceID,
		Name:             name,
		InvestmentType:   invType,
		InstitutionName:  optionalPgText(in.InstitutionName),
		Currency:         currency,
		CurrencyExponent: exponent,
		Status:           "draft",
		Notes:            optionalPgText(in.Notes),
		IdempotencyKey:   idempParam,
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return InvestmentDetail{}, fmt.Errorf("create investment: %w", err)
	}
	return s.GetInvestmentDetail(ctx, workspaceID, inv.ID)
}

func (s *Service) RecordInvestmentEvent(ctx context.Context, workspaceID, userID int64, idempKey string, in RecordInvestmentEventInput) (InvestmentDetail, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	effDate, err := parseDateStrict(in.EffectiveDate)
	if err != nil {
		return InvestmentDetail{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return InvestmentDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existingEv, err := qtx.GetInvestmentEventByIdempotency(ctx, db.GetInvestmentEventByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			tx.Rollback(ctx)
			return s.GetInvestmentDetail(ctx, workspaceID, existingEv.InvestmentID)
		}
		if !isNoRows(err) {
			return InvestmentDetail{}, err
		}
	}

	inv, err := qtx.GetInvestmentForUpdate(ctx, db.GetInvestmentForUpdateParams{
		ID:          in.InvestmentID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return InvestmentDetail{}, ErrNotFound
	}
	if err != nil {
		return InvestmentDetail{}, err
	}
	if inv.Status == "disposed" || inv.Status == "archived" {
		return InvestmentDetail{}, errors.New("investment is already disposed or archived")
	}

	amountMinor, err := resolveAmountMinor(in.Amount, in.AmountMinor, inv.Currency)
	if err != nil {
		return InvestmentDetail{}, err
	}
	if amountMinor <= 0 {
		return InvestmentDetail{}, errors.New("amount must be greater than zero")
	}

	unitsDelta := decimal.Zero
	if strings.TrimSpace(in.UnitsDelta) != "" {
		unitsDelta, err = decimal.NewFromString(strings.TrimSpace(in.UnitsDelta))
		if err != nil {
			return InvestmentDetail{}, errors.New("invalid units_delta decimal")
		}
	}

	evType := strings.TrimSpace(in.EventType)
	var acc *db.MoneyAccount
	if evType != "opening" {
		if in.MoneyAccountID == nil || *in.MoneyAccountID <= 0 {
			return InvestmentDetail{}, errors.New("money_account_id is required")
		}
		lockedAcc, err := qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{
			ID:          *in.MoneyAccountID,
			WorkspaceID: workspaceID,
		})
		if isNoRows(err) {
			return InvestmentDetail{}, ErrForbiddenAccount
		}
		if err != nil {
			return InvestmentDetail{}, err
		}
		if !lockedAcc.IsActive {
			return InvestmentDetail{}, ErrAccountArchived
		}
		if lockedAcc.Currency != inv.Currency {
			return InvestmentDetail{}, ErrAccountCurrencyMismatch
		}
		acc = &lockedAcc
	}

	newUnits := inv.TotalUnits
	newCostBasis := inv.CostBasisMinor
	newTotalIncome := inv.TotalIncomeMinor
	newStatus := "active"
	var costBasisDelta int64
	var realizedGL pgtype.Int8
	glStatus := "not_applicable"
	var mtID pgtype.Int8
	var lines []ledgerPostingLine

	switch evType {
	case "purchase", "contribution":
		newUnits = newUnits.Add(unitsDelta)
		newCostBasis += amountMinor
		costBasisDelta = amountMinor

		mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
			WorkspaceID:      workspaceID,
			Direction:        "money_out",
			Status:           "posted",
			AmountMinor:      amountMinor,
			Currency:         inv.Currency,
			CurrencyExponent: inv.CurrencyExponent,
			EffectiveDate:    pgtype.Date{Time: effDate, Valid: true},
			MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
			CounterpartyName: inv.InstitutionName,
			Purpose:          "investment_" + evType,
			Notes:            optionalPgText(in.Notes),
			CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
			PostedAt:         pgtype.Timestamptz{Time: effDate, Valid: true},
		})
		if err != nil {
			return InvestmentDetail{}, err
		}
		mtID = pgtype.Int8{Int64: mt.ID, Valid: true}

		if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  acc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: -amountMinor,
		}); err != nil {
			return InvestmentDetail{}, err
		}

		lines = []ledgerPostingLine{
			{AccountClass: "asset", DebitMinor: amountMinor, Description: "Investment acquisition: " + inv.Name},
			{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), CreditMinor: amountMinor, Description: "Cash paid for investment"},
		}

	case "opening":
		newUnits = newUnits.Add(unitsDelta)
		newCostBasis += amountMinor
		costBasisDelta = amountMinor
		lines = []ledgerPostingLine{
			{AccountClass: "asset", DebitMinor: amountMinor, Description: "Opening investment: " + inv.Name},
			{AccountClass: "equity", CreditMinor: amountMinor, Description: "Opening investment equity"},
		}

	case "income":
		newTotalIncome += amountMinor
		mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
			WorkspaceID:      workspaceID,
			Direction:        "money_in",
			Status:           "posted",
			AmountMinor:      amountMinor,
			Currency:         inv.Currency,
			CurrencyExponent: inv.CurrencyExponent,
			EffectiveDate:    pgtype.Date{Time: effDate, Valid: true},
			MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
			CounterpartyName: inv.InstitutionName,
			Purpose:          "investment_income",
			Notes:            optionalPgText(in.Notes),
			CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
			PostedAt:         pgtype.Timestamptz{Time: effDate, Valid: true},
		})
		if err != nil {
			return InvestmentDetail{}, err
		}
		mtID = pgtype.Int8{Int64: mt.ID, Valid: true}

		if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  acc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: amountMinor,
		}); err != nil {
			return InvestmentDetail{}, err
		}

		lines = []ledgerPostingLine{
			{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), DebitMinor: amountMinor, Description: "Investment income received"},
			{AccountClass: "revenue", CreditMinor: amountMinor, Description: "Investment income: " + inv.Name},
		}

	case "disposal":
		basisToRemove := inv.CostBasisMinor
		if in.CostBasisMinor != nil {
			basisToRemove = *in.CostBasisMinor
		}
		if basisToRemove > inv.CostBasisMinor {
			return InvestmentDetail{}, errors.New("disposal cost basis exceeds remaining investment cost basis")
		}
		newUnits = newUnits.Sub(unitsDelta)
		if newUnits.IsNegative() {
			newUnits = decimal.Zero
		}
		newCostBasis -= basisToRemove
		costBasisDelta = -basisToRemove
		if newCostBasis == 0 && newUnits.IsZero() {
			newStatus = "disposed"
		}

		mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
			WorkspaceID:      workspaceID,
			Direction:        "money_in",
			Status:           "posted",
			AmountMinor:      amountMinor,
			Currency:         inv.Currency,
			CurrencyExponent: inv.CurrencyExponent,
			EffectiveDate:    pgtype.Date{Time: effDate, Valid: true},
			MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
			CounterpartyName: inv.InstitutionName,
			Purpose:          "investment_disposal",
			Notes:            optionalPgText(in.Notes),
			CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
			PostedAt:         pgtype.Timestamptz{Time: effDate, Valid: true},
		})
		if err != nil {
			return InvestmentDetail{}, err
		}
		mtID = pgtype.Int8{Int64: mt.ID, Valid: true}

		if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  acc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: amountMinor,
		}); err != nil {
			return InvestmentDetail{}, err
		}

		if basisToRemove > 0 {
			gl := amountMinor - basisToRemove
			realizedGL = pgtype.Int8{Int64: gl, Valid: true}
			glStatus = "computed"
			lines = append(lines, ledgerPostingLine{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), DebitMinor: amountMinor, Description: "Investment disposal proceeds"})
			lines = append(lines, ledgerPostingLine{AccountClass: "asset", CreditMinor: basisToRemove, Description: "Remove investment cost basis"})
			if gl > 0 {
				lines = append(lines, ledgerPostingLine{AccountClass: "revenue", CreditMinor: gl, Description: "Realized investment gain"})
			} else if gl < 0 {
				lines = append(lines, ledgerPostingLine{AccountClass: "expense", DebitMinor: -gl, Description: "Realized investment loss"})
			}
		} else {
			// Insufficient basis: do not invent gain/loss, mark for review and post proceeds to clearing/equity
			glStatus = "needs_review"
			lines = []ledgerPostingLine{
				{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), DebitMinor: amountMinor, Description: "Investment disposal proceeds"},
				{AccountClass: "equity", CreditMinor: amountMinor, Description: "Investment disposal (cost basis needs review)"},
			}
		}

	default:
		return InvestmentDetail{}, errors.New("invalid investment event_type")
	}

	le, err := postBalancedLedgerTx(
		ctx, qtx, workspaceID, "investment_event", inv.ID, effDate,
		inv.Currency, inv.CurrencyExponent, fmt.Sprintf("Investment %s: %s", evType, inv.Name), lines,
	)
	if err != nil {
		return InvestmentDetail{}, err
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}
	if _, err := qtx.CreateInvestmentEvent(ctx, db.CreateInvestmentEventParams{
		WorkspaceID:           workspaceID,
		InvestmentID:          inv.ID,
		EventType:             evType,
		EffectiveDate:         pgtype.Date{Time: effDate, Valid: true},
		AmountMinor:           amountMinor,
		UnitsDelta:            unitsDelta,
		CostBasisDeltaMinor:   costBasisDelta,
		RealizedGainLossMinor: realizedGL,
		GainLossStatus:        glStatus,
		MoneyAccountID:        pgInt8Ptr(in.MoneyAccountID),
		MoneyTransactionID:    mtID,
		LedgerEntryID:         pgtype.Int8{Int64: le.ID, Valid: true},
		Notes:                 optionalPgText(in.Notes),
		IdempotencyKey:        idempParam,
		CreatedByUserID:       pgtype.Int8{Int64: userID, Valid: true},
	}); err != nil {
		return InvestmentDetail{}, err
	}

	if _, err := qtx.UpdateInvestmentTotals(ctx, db.UpdateInvestmentTotalsParams{
		ID:               inv.ID,
		WorkspaceID:      workspaceID,
		TotalUnits:       newUnits,
		CostBasisMinor:   newCostBasis,
		TotalIncomeMinor: newTotalIncome,
		Status:           newStatus,
	}); err != nil {
		return InvestmentDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return InvestmentDetail{}, fmt.Errorf("commit investment event: %w", err)
	}
	return s.GetInvestmentDetail(ctx, workspaceID, inv.ID)
}

func (s *Service) RecordInvestmentValuation(ctx context.Context, workspaceID, userID, investmentID int64, in CreateValuationInput) (InvestmentDetail, error) {
	valDate, err := parseDateStrict(in.ValuationDate)
	if err != nil {
		return InvestmentDetail{}, err
	}
	inv, err := s.queries.GetInvestmentByID(ctx, db.GetInvestmentByIDParams{
		ID:          investmentID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return InvestmentDetail{}, ErrNotFound
	}
	if err != nil {
		return InvestmentDetail{}, err
	}
	valMinor, err := resolveAmountMinor(in.Value, in.ValueMinor, inv.Currency)
	if err != nil {
		return InvestmentDetail{}, err
	}
	if valMinor < 0 {
		return InvestmentDetail{}, errors.New("valuation cannot be negative")
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = "user_manual"
	}

	if _, err := s.queries.CreateInvestmentValuation(ctx, db.CreateInvestmentValuationParams{
		WorkspaceID:     workspaceID,
		InvestmentID:    investmentID,
		ValuationDate:   pgtype.Date{Time: valDate, Valid: true},
		ValueMinor:      valMinor,
		Source:          source,
		Notes:           optionalPgText(in.Notes),
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	}); err != nil {
		return InvestmentDetail{}, err
	}

	if _, err := s.queries.UpdateInvestmentManualValuation(ctx, db.UpdateInvestmentManualValuationParams{
		ID:                     investmentID,
		WorkspaceID:            workspaceID,
		LatestManualValueMinor: pgtype.Int8{Int64: valMinor, Valid: true},
		LatestValuationDate:    pgtype.Date{Time: valDate, Valid: true},
		LatestValuationSource:  pgtype.Text{String: source, Valid: true},
	}); err != nil {
		return InvestmentDetail{}, err
	}

	return s.GetInvestmentDetail(ctx, workspaceID, investmentID)
}

func (s *Service) ListInvestments(ctx context.Context, workspaceID int64, status string) ([]db.Investment, error) {
	var statusParam pgtype.Text
	if status != "" {
		statusParam = pgtype.Text{String: status, Valid: true}
	}
	return s.queries.ListInvestments(ctx, db.ListInvestmentsParams{
		WorkspaceID: workspaceID,
		Limit:       100,
		Status:      statusParam,
	})
}

func (s *Service) GetInvestmentDetail(ctx context.Context, workspaceID, investmentID int64) (InvestmentDetail, error) {
	inv, err := s.queries.GetInvestmentByID(ctx, db.GetInvestmentByIDParams{
		ID:          investmentID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return InvestmentDetail{}, ErrNotFound
	}
	if err != nil {
		return InvestmentDetail{}, err
	}
	events, err := s.queries.ListInvestmentEvents(ctx, db.ListInvestmentEventsParams{
		WorkspaceID:  workspaceID,
		InvestmentID: investmentID,
	})
	if err != nil {
		return InvestmentDetail{}, err
	}
	valuations, err := s.queries.ListInvestmentValuations(ctx, db.ListInvestmentValuationsParams{
		WorkspaceID:  workspaceID,
		InvestmentID: investmentID,
	})
	if err != nil {
		return InvestmentDetail{}, err
	}
	return InvestmentDetail{
		Investment: inv,
		Events:     events,
		Valuations: valuations,
	}, nil
}

// ---------------- Personal Assets ----------------

type CreateAssetInput struct {
	Name           string `json:"name" binding:"required"`
	AssetType      string `json:"asset_type" binding:"required"` // vehicle, property, electronics_equipment, personal_item, other
	Currency       string `json:"currency"`
	EvidenceKey    string `json:"evidence_key"`
	Notes          string `json:"notes"`
	IdempotencyKey string `json:"idempotency_key"`
}

type AcquireAssetInput struct {
	AssetID         int64  `json:"asset_id" binding:"required"`
	AcquisitionDate string `json:"acquisition_date" binding:"required"`
	CostMinor       int64  `json:"cost_minor"`
	Cost            string `json:"cost"`
	IsOpeningAsset  bool   `json:"is_opening_asset"`
	MoneyAccountID  *int64 `json:"money_account_id"`
	EvidenceKey     string `json:"evidence_key"`
	Notes           string `json:"notes"`
	IdempotencyKey  string `json:"idempotency_key"`
}

type DisposeAssetInput struct {
	AssetID           int64  `json:"asset_id" binding:"required"`
	DisposalDate      string `json:"disposal_date" binding:"required"`
	ProceedsMinor     int64  `json:"proceeds_minor"`
	Proceeds          string `json:"proceeds"`
	DisposalCostMinor int64  `json:"disposal_costs_minor"`
	DisposalCost      string `json:"disposal_costs"`
	MoneyAccountID    int64  `json:"money_account_id" binding:"required"`
	CounterpartyName  string `json:"counterparty_name"`
	EvidenceKey       string `json:"evidence_key"`
	Notes             string `json:"notes"`
	IdempotencyKey    string `json:"idempotency_key"`
}

type AssetDetail struct {
	Asset      db.Asset            `json:"asset"`
	Events     []db.AssetEvent     `json:"events"`
	Valuations []db.AssetValuation `json:"valuations"`
}

func (s *Service) CreatePersonalAsset(ctx context.Context, workspaceID, userID int64, idempKey string, in CreateAssetInput) (AssetDetail, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return AssetDetail{}, errors.New("asset name is required")
	}
	assetType := strings.TrimSpace(in.AssetType)
	switch assetType {
	case "vehicle", "property", "electronics_equipment", "personal_item", "other":
	default:
		return AssetDetail{}, errors.New("invalid asset_type")
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := int32(CurrencyExponent(currency))

	if idempKey != "" {
		existing, err := s.queries.GetAssetByIdempotency(ctx, db.GetAssetByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			return s.GetPersonalAssetDetail(ctx, workspaceID, existing.ID)
		}
		if !isNoRows(err) {
			return AssetDetail{}, err
		}
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	asset, err := s.queries.CreateAsset(ctx, db.CreateAssetParams{
		WorkspaceID:      workspaceID,
		Name:             name,
		AssetType:        assetType,
		Currency:         currency,
		CurrencyExponent: exponent,
		Status:           "draft",
		EvidenceKey:      optionalPgText(in.EvidenceKey),
		Notes:            optionalPgText(in.Notes),
		IdempotencyKey:   idempParam,
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return AssetDetail{}, fmt.Errorf("create asset: %w", err)
	}
	return s.GetPersonalAssetDetail(ctx, workspaceID, asset.ID)
}

func (s *Service) AcquirePersonalAsset(ctx context.Context, workspaceID, userID int64, idempKey string, in AcquireAssetInput) (AssetDetail, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	acqDate, err := parseDateStrict(in.AcquisitionDate)
	if err != nil {
		return AssetDetail{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AssetDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existingEv, err := qtx.GetAssetEventByIdempotency(ctx, db.GetAssetEventByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			tx.Rollback(ctx)
			return s.GetPersonalAssetDetail(ctx, workspaceID, existingEv.AssetID)
		}
		if !isNoRows(err) {
			return AssetDetail{}, err
		}
	}

	asset, err := qtx.GetAssetForUpdate(ctx, db.GetAssetForUpdateParams{
		ID:          in.AssetID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return AssetDetail{}, ErrNotFound
	}
	if err != nil {
		return AssetDetail{}, err
	}
	if asset.Status == "disposed" || asset.Status == "active" {
		return AssetDetail{}, errors.New("asset is already acquired or disposed")
	}

	costMinor, err := resolveAmountMinor(in.Cost, in.CostMinor, asset.Currency)
	if err != nil {
		return AssetDetail{}, err
	}
	if costMinor <= 0 {
		return AssetDetail{}, errors.New("acquisition cost must be greater than zero")
	}

	var mtID pgtype.Int8
	var lines []ledgerPostingLine
	evType := "acquisition"
	if in.IsOpeningAsset {
		evType = "opening"
		lines = []ledgerPostingLine{
			{AccountClass: "asset", DebitMinor: costMinor, Description: "Opening personal asset: " + asset.Name},
			{AccountClass: "equity", CreditMinor: costMinor, Description: "Opening asset equity"},
		}
	} else {
		if in.MoneyAccountID == nil || *in.MoneyAccountID <= 0 {
			return AssetDetail{}, errors.New("money_account_id is required for cash asset acquisition")
		}
		acc, err := qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{
			ID:          *in.MoneyAccountID,
			WorkspaceID: workspaceID,
		})
		if isNoRows(err) {
			return AssetDetail{}, ErrForbiddenAccount
		}
		if err != nil {
			return AssetDetail{}, err
		}
		if !acc.IsActive {
			return AssetDetail{}, ErrAccountArchived
		}
		if acc.Currency != asset.Currency {
			return AssetDetail{}, ErrAccountCurrencyMismatch
		}

		mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
			WorkspaceID:      workspaceID,
			Direction:        "money_out",
			Status:           "posted",
			AmountMinor:      costMinor,
			Currency:         asset.Currency,
			CurrencyExponent: asset.CurrencyExponent,
			EffectiveDate:    pgtype.Date{Time: acqDate, Valid: true},
			MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
			Purpose:          "asset_acquisition",
			Notes:            optionalPgText(in.Notes),
			CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
			PostedAt:         pgtype.Timestamptz{Time: acqDate, Valid: true},
		})
		if err != nil {
			return AssetDetail{}, err
		}
		mtID = pgtype.Int8{Int64: mt.ID, Valid: true}

		if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  acc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: -costMinor,
		}); err != nil {
			return AssetDetail{}, err
		}

		lines = []ledgerPostingLine{
			{AccountClass: "asset", DebitMinor: costMinor, Description: "Personal asset acquired: " + asset.Name},
			{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), CreditMinor: costMinor, Description: "Cash paid for asset"},
		}
	}

	le, err := postBalancedLedgerTx(
		ctx, qtx, workspaceID, "asset_event", asset.ID, acqDate,
		asset.Currency, asset.CurrencyExponent, "Personal asset acquisition: "+asset.Name, lines,
	)
	if err != nil {
		return AssetDetail{}, err
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}
	if _, err := qtx.CreateAssetEvent(ctx, db.CreateAssetEventParams{
		WorkspaceID:        workspaceID,
		AssetID:            asset.ID,
		EventType:          evType,
		EffectiveDate:      pgtype.Date{Time: acqDate, Valid: true},
		AmountMinor:        costMinor,
		MoneyAccountID:     pgInt8Ptr(in.MoneyAccountID),
		MoneyTransactionID: mtID,
		LedgerEntryID:      pgtype.Int8{Int64: le.ID, Valid: true},
		Notes:              optionalPgText(in.Notes),
		EvidenceKey:        optionalPgText(in.EvidenceKey),
		IdempotencyKey:     idempParam,
		CreatedByUserID:    pgtype.Int8{Int64: userID, Valid: true},
	}); err != nil {
		return AssetDetail{}, err
	}

	if _, err := qtx.UpdateAssetAcquisition(ctx, db.UpdateAssetAcquisitionParams{
		ID:                   asset.ID,
		WorkspaceID:          workspaceID,
		AcquisitionDate:      pgtype.Date{Time: acqDate, Valid: true},
		AcquisitionCostMinor: costMinor,
		IsOpeningAsset:       in.IsOpeningAsset,
		MoneyAccountID:       pgInt8Ptr(in.MoneyAccountID),
		EvidenceKey:          optionalPgText(in.EvidenceKey),
	}); err != nil {
		return AssetDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return AssetDetail{}, fmt.Errorf("commit asset acquisition: %w", err)
	}
	return s.GetPersonalAssetDetail(ctx, workspaceID, asset.ID)
}

func (s *Service) DisposePersonalAsset(ctx context.Context, workspaceID, userID int64, idempKey string, in DisposeAssetInput) (AssetDetail, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	dispDate, err := parseDateStrict(in.DisposalDate)
	if err != nil {
		return AssetDetail{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AssetDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existingEv, err := qtx.GetAssetEventByIdempotency(ctx, db.GetAssetEventByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			tx.Rollback(ctx)
			return s.GetPersonalAssetDetail(ctx, workspaceID, existingEv.AssetID)
		}
		if !isNoRows(err) {
			return AssetDetail{}, err
		}
	}

	asset, err := qtx.GetAssetForUpdate(ctx, db.GetAssetForUpdateParams{
		ID:          in.AssetID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return AssetDetail{}, ErrNotFound
	}
	if err != nil {
		return AssetDetail{}, err
	}
	if asset.Status == "disposed" {
		return AssetDetail{}, ErrAssetAlreadyDisposed
	}

	proceedsMinor, err := resolveNonNegativeAmountMinor(in.Proceeds, in.ProceedsMinor, asset.Currency)
	if err != nil {
		return AssetDetail{}, err
	}
	costsMinor, err := resolveNonNegativeAmountMinor(in.DisposalCost, in.DisposalCostMinor, asset.Currency)
	if err != nil {
		return AssetDetail{}, err
	}
	if proceedsMinor < 0 || costsMinor < 0 {
		return AssetDetail{}, errors.New("proceeds and disposal costs cannot be negative")
	}

	acc, err := qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{
		ID:          in.MoneyAccountID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return AssetDetail{}, ErrForbiddenAccount
	}
	if err != nil {
		return AssetDetail{}, err
	}
	if !acc.IsActive {
		return AssetDetail{}, ErrAccountArchived
	}
	if acc.Currency != asset.Currency {
		return AssetDetail{}, ErrAccountCurrencyMismatch
	}

	netProceeds := proceedsMinor - costsMinor
	var mtID pgtype.Int8
	if netProceeds != 0 {
		mtDir := "money_in"
		mtAmount := netProceeds
		if netProceeds < 0 {
			mtDir = "money_out"
			mtAmount = -netProceeds
		}
		mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
			WorkspaceID:      workspaceID,
			Direction:        mtDir,
			Status:           "posted",
			AmountMinor:      mtAmount,
			Currency:         asset.Currency,
			CurrencyExponent: asset.CurrencyExponent,
			EffectiveDate:    pgtype.Date{Time: dispDate, Valid: true},
			MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
			CounterpartyName: optionalPgText(in.CounterpartyName),
			Purpose:          "asset_disposal",
			Notes:            optionalPgText(in.Notes),
			CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
			PostedAt:         pgtype.Timestamptz{Time: dispDate, Valid: true},
		})
		if err != nil {
			return AssetDetail{}, err
		}
		mtID = pgtype.Int8{Int64: mt.ID, Valid: true}

		if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  acc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: netProceeds,
		}); err != nil {
			return AssetDetail{}, err
		}
	}

	var realizedGL pgtype.Int8
	var lines []ledgerPostingLine
	if asset.AcquisitionCostMinor > 0 {
		gl := netProceeds - asset.AcquisitionCostMinor
		realizedGL = pgtype.Int8{Int64: gl, Valid: true}
		if netProceeds > 0 {
			lines = append(lines, ledgerPostingLine{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), DebitMinor: netProceeds, Description: "Asset disposal net proceeds"})
		} else if netProceeds < 0 {
			lines = append(lines, ledgerPostingLine{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), CreditMinor: -netProceeds, Description: "Asset disposal net cost"})
		}
		lines = append(lines, ledgerPostingLine{AccountClass: "asset", CreditMinor: asset.AcquisitionCostMinor, Description: "Remove asset cost basis"})
		if gl > 0 {
			lines = append(lines, ledgerPostingLine{AccountClass: "revenue", CreditMinor: gl, Description: "Realized asset disposal gain"})
		} else if gl < 0 {
			lines = append(lines, ledgerPostingLine{AccountClass: "expense", DebitMinor: -gl, Description: "Realized asset disposal loss"})
		}
	} else if netProceeds != 0 {
		// Basis unavailable: do not invent gain/loss
		if netProceeds > 0 {
			lines = []ledgerPostingLine{
				{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), DebitMinor: netProceeds, Description: "Asset disposal proceeds"},
				{AccountClass: "equity", CreditMinor: netProceeds, Description: "Asset disposal (basis unavailable)"},
			}
		} else {
			lines = []ledgerPostingLine{
				{AccountClass: "expense", DebitMinor: -netProceeds, Description: "Asset disposal cost"},
				{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), CreditMinor: -netProceeds, Description: "Cash paid for disposal"},
			}
		}
	}

	var leID pgtype.Int8
	if len(lines) > 0 {
		le, err := postBalancedLedgerTx(
			ctx, qtx, workspaceID, "asset_event", asset.ID, dispDate,
			asset.Currency, asset.CurrencyExponent, "Personal asset disposal: "+asset.Name, lines,
		)
		if err != nil {
			return AssetDetail{}, err
		}
		leID = pgtype.Int8{Int64: le.ID, Valid: true}
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}
	if _, err := qtx.CreateAssetEvent(ctx, db.CreateAssetEventParams{
		WorkspaceID:        workspaceID,
		AssetID:            asset.ID,
		EventType:          "disposal",
		EffectiveDate:      pgtype.Date{Time: dispDate, Valid: true},
		AmountMinor:        proceedsMinor,
		DisposalCostsMinor: costsMinor,
		CounterpartyName:   optionalPgText(in.CounterpartyName),
		MoneyAccountID:     pgtype.Int8{Int64: acc.ID, Valid: true},
		MoneyTransactionID: mtID,
		LedgerEntryID:      leID,
		Notes:              optionalPgText(in.Notes),
		EvidenceKey:        optionalPgText(in.EvidenceKey),
		IdempotencyKey:     idempParam,
		CreatedByUserID:    pgtype.Int8{Int64: userID, Valid: true},
	}); err != nil {
		return AssetDetail{}, err
	}

	if _, err := qtx.UpdateAssetDisposal(ctx, db.UpdateAssetDisposalParams{
		ID:                    asset.ID,
		WorkspaceID:           workspaceID,
		DisposalDate:          pgtype.Date{Time: dispDate, Valid: true},
		DisposalProceedsMinor: pgtype.Int8{Int64: proceedsMinor, Valid: true},
		DisposalCostsMinor:    pgtype.Int8{Int64: costsMinor, Valid: true},
		RealizedGainLossMinor: realizedGL,
	}); err != nil {
		return AssetDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return AssetDetail{}, fmt.Errorf("commit asset disposal: %w", err)
	}
	return s.GetPersonalAssetDetail(ctx, workspaceID, asset.ID)
}

func (s *Service) RecordAssetValuation(ctx context.Context, workspaceID, userID, assetID int64, in CreateValuationInput) (AssetDetail, error) {
	valDate, err := parseDateStrict(in.ValuationDate)
	if err != nil {
		return AssetDetail{}, err
	}
	asset, err := s.queries.GetAssetByID(ctx, db.GetAssetByIDParams{
		ID:          assetID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return AssetDetail{}, ErrNotFound
	}
	if err != nil {
		return AssetDetail{}, err
	}
	valMinor, err := resolveAmountMinor(in.Value, in.ValueMinor, asset.Currency)
	if err != nil {
		return AssetDetail{}, err
	}
	if valMinor < 0 {
		return AssetDetail{}, errors.New("valuation cannot be negative")
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = "user_manual"
	}

	if _, err := s.queries.CreateAssetValuation(ctx, db.CreateAssetValuationParams{
		WorkspaceID:     workspaceID,
		AssetID:         assetID,
		ValuationDate:   pgtype.Date{Time: valDate, Valid: true},
		ValueMinor:      valMinor,
		Source:          source,
		Notes:           optionalPgText(in.Notes),
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	}); err != nil {
		return AssetDetail{}, err
	}

	if _, err := s.queries.UpdateAssetManualValuation(ctx, db.UpdateAssetManualValuationParams{
		ID:                     assetID,
		WorkspaceID:            workspaceID,
		LatestManualValueMinor: pgtype.Int8{Int64: valMinor, Valid: true},
		LatestValuationDate:    pgtype.Date{Time: valDate, Valid: true},
		LatestValuationSource:  pgtype.Text{String: source, Valid: true},
	}); err != nil {
		return AssetDetail{}, err
	}

	return s.GetPersonalAssetDetail(ctx, workspaceID, assetID)
}

func (s *Service) ListPersonalAssets(ctx context.Context, workspaceID int64, status string) ([]db.Asset, error) {
	var statusParam pgtype.Text
	if status != "" {
		statusParam = pgtype.Text{String: status, Valid: true}
	}
	return s.queries.ListAssets(ctx, db.ListAssetsParams{
		WorkspaceID: workspaceID,
		Limit:       100,
		Status:      statusParam,
	})
}

func (s *Service) GetPersonalAssetDetail(ctx context.Context, workspaceID, assetID int64) (AssetDetail, error) {
	asset, err := s.queries.GetAssetByID(ctx, db.GetAssetByIDParams{
		ID:          assetID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return AssetDetail{}, ErrNotFound
	}
	if err != nil {
		return AssetDetail{}, err
	}
	events, err := s.queries.ListAssetEvents(ctx, db.ListAssetEventsParams{
		WorkspaceID: workspaceID,
		AssetID:     assetID,
	})
	if err != nil {
		return AssetDetail{}, err
	}
	valuations, err := s.queries.ListAssetValuations(ctx, db.ListAssetValuationsParams{
		WorkspaceID: workspaceID,
		AssetID:     assetID,
	})
	if err != nil {
		return AssetDetail{}, err
	}
	return AssetDetail{
		Asset:      asset,
		Events:     events,
		Valuations: valuations,
	}, nil
}
