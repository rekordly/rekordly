package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type OwnerTransferInput struct {
	FromWorkspaceID    int64  `json:"from_workspace_id" binding:"required"`
	ToWorkspaceID      int64  `json:"to_workspace_id" binding:"required"`
	FromMoneyAccountID int64  `json:"from_money_account_id" binding:"required"`
	ToMoneyAccountID   int64  `json:"to_money_account_id" binding:"required"`
	Purpose            string `json:"purpose" binding:"required"`
	AmountMinor        int64  `json:"amount_minor"`
	Amount             string `json:"amount"`
	Currency           string `json:"currency"`
	EffectiveDate      string `json:"effective_date" binding:"required"`
	Notes              string `json:"notes"`
	Reference          string `json:"reference"`
	IdempotencyKey     string `json:"idempotency_key"`
}

type OwnerTransferResult struct {
	Group           db.OwnerTransferGroup `json:"group"`
	FromTransaction db.MoneyTransaction   `json:"from_transaction"`
	ToTransaction   db.MoneyTransaction   `json:"to_transaction"`
	WasDuplicate    bool                  `json:"was_duplicate"`
}

func isValidOwnerTransferPurpose(purpose string) bool {
	switch purpose {
	case "owner_capital_contribution",
		"owner_loan",
		"owner_loan_repayment",
		"owner_drawing_distribution",
		"business_expense_reimbursement",
		"personal_expense_paid_for_business":
		return true
	default:
		return false
	}
}

func ownerTransferLedgerClasses(fromKind, toKind, purpose string) (fromDebitClass, toCreditClass string) {
	switch purpose {
	case "owner_capital_contribution":
		if fromKind == "personal" && toKind == "business" {
			return "asset", "equity"
		}
		return "equity", "equity"
	case "owner_loan":
		return "asset", "liability"
	case "owner_loan_repayment":
		return "liability", "asset"
	case "owner_drawing_distribution":
		return "equity", "equity"
	case "business_expense_reimbursement":
		return "liability", "asset"
	case "personal_expense_paid_for_business":
		return "asset", "liability"
	default:
		return "equity", "equity"
	}
}

func (s *Service) TransferBetweenSpaces(ctx context.Context, ownerUserID int64, idempKey string, in OwnerTransferInput) (OwnerTransferResult, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	if strings.TrimSpace(idempKey) == "" {
		return OwnerTransferResult{}, errors.New("Idempotency-Key header is required")
	}
	purpose := strings.TrimSpace(in.Purpose)
	if !isValidOwnerTransferPurpose(purpose) {
		return OwnerTransferResult{}, ErrOwnerTransferPurpose
	}
	if in.FromWorkspaceID <= 0 || in.ToWorkspaceID <= 0 || in.FromWorkspaceID == in.ToWorkspaceID {
		return OwnerTransferResult{}, errors.New("from_workspace_id and to_workspace_id must be distinct valid workspaces")
	}
	effDate, err := parseDateStrict(in.EffectiveDate)
	if err != nil {
		return OwnerTransferResult{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return OwnerTransferResult{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	existing, err := qtx.GetOwnerTransferGroupByIdempotency(ctx, db.GetOwnerTransferGroupByIdempotencyParams{
		OwnerUserID:    ownerUserID,
		IdempotencyKey: idempKey,
	})
	if err == nil {
		var fromTx, toTx db.MoneyTransaction
		if existing.FromMoneyTransactionID.Valid {
			fromTx, _ = qtx.GetMoneyTransactionByID(ctx, db.GetMoneyTransactionByIDParams{ID: existing.FromMoneyTransactionID.Int64, WorkspaceID: existing.FromWorkspaceID})
		}
		if existing.ToMoneyTransactionID.Valid {
			toTx, _ = qtx.GetMoneyTransactionByID(ctx, db.GetMoneyTransactionByIDParams{ID: existing.ToMoneyTransactionID.Int64, WorkspaceID: existing.ToWorkspaceID})
		}
		return OwnerTransferResult{Group: existing, FromTransaction: fromTx, ToTransaction: toTx, WasDuplicate: true}, nil
	}
	if !isNoRows(err) {
		return OwnerTransferResult{}, err
	}

	fromWS, err := qtx.GetWorkspaceByIDAndOwner(ctx, db.GetWorkspaceByIDAndOwnerParams{
		ID:          in.FromWorkspaceID,
		OwnerUserID: ownerUserID,
	})
	if isNoRows(err) {
		return OwnerTransferResult{}, ErrCrossSpaceAccessRequired
	}
	if err != nil {
		return OwnerTransferResult{}, err
	}

	toWS, err := qtx.GetWorkspaceByIDAndOwner(ctx, db.GetWorkspaceByIDAndOwnerParams{
		ID:          in.ToWorkspaceID,
		OwnerUserID: ownerUserID,
	})
	if isNoRows(err) {
		return OwnerTransferResult{}, ErrCrossSpaceAccessRequired
	}
	if err != nil {
		return OwnerTransferResult{}, err
	}

	// Lock accounts in deterministic order to avoid deadlocks
	var fromAcc, toAcc db.MoneyAccount
	if in.FromMoneyAccountID <= in.ToMoneyAccountID {
		fromAcc, err = qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{ID: in.FromMoneyAccountID, WorkspaceID: fromWS.ID})
		if isNoRows(err) {
			return OwnerTransferResult{}, ErrForbiddenAccount
		}
		if err != nil {
			return OwnerTransferResult{}, err
		}
		toAcc, err = qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{ID: in.ToMoneyAccountID, WorkspaceID: toWS.ID})
		if isNoRows(err) {
			return OwnerTransferResult{}, ErrForbiddenAccount
		}
		if err != nil {
			return OwnerTransferResult{}, err
		}
	} else {
		toAcc, err = qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{ID: in.ToMoneyAccountID, WorkspaceID: toWS.ID})
		if isNoRows(err) {
			return OwnerTransferResult{}, ErrForbiddenAccount
		}
		if err != nil {
			return OwnerTransferResult{}, err
		}
		fromAcc, err = qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{ID: in.FromMoneyAccountID, WorkspaceID: fromWS.ID})
		if isNoRows(err) {
			return OwnerTransferResult{}, ErrForbiddenAccount
		}
		if err != nil {
			return OwnerTransferResult{}, err
		}
	}

	if !fromAcc.IsActive || !toAcc.IsActive {
		return OwnerTransferResult{}, ErrAccountArchived
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = fromAcc.Currency
	}
	if fromAcc.Currency != currency || toAcc.Currency != currency {
		return OwnerTransferResult{}, ErrAccountCurrencyMismatch
	}

	amountMinor, err := resolveAmountMinor(in.Amount, in.AmountMinor, currency)
	if err != nil {
		return OwnerTransferResult{}, err
	}
	if amountMinor <= 0 {
		return OwnerTransferResult{}, errors.New("transfer amount must be greater than zero")
	}

	fromTx, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
		WorkspaceID:      fromWS.ID,
		Direction:        "money_out",
		Status:           "posted",
		AmountMinor:      amountMinor,
		Currency:         currency,
		CurrencyExponent: fromAcc.CurrencyExponent,
		EffectiveDate:    pgtype.Date{Time: effDate, Valid: true},
		MoneyAccountID:   pgtype.Int8{Int64: fromAcc.ID, Valid: true},
		CounterpartyName: pgtype.Text{String: toWS.Name, Valid: true},
		Purpose:          "owner_transfer",
		Notes:            optionalPgText(in.Notes),
		Reference:        optionalPgText(in.Reference),
		CreatedByUserID:  pgtype.Int8{Int64: ownerUserID, Valid: true},
		PostedAt:         pgtype.Timestamptz{Time: effDate, Valid: true},
	})
	if err != nil {
		return OwnerTransferResult{}, fmt.Errorf("create from tx: %w", err)
	}

	toTx, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
		WorkspaceID:      toWS.ID,
		Direction:        "money_in",
		Status:           "posted",
		AmountMinor:      amountMinor,
		Currency:         currency,
		CurrencyExponent: toAcc.CurrencyExponent,
		EffectiveDate:    pgtype.Date{Time: effDate, Valid: true},
		MoneyAccountID:   pgtype.Int8{Int64: toAcc.ID, Valid: true},
		CounterpartyName: pgtype.Text{String: fromWS.Name, Valid: true},
		Purpose:          "owner_transfer",
		Notes:            optionalPgText(in.Notes),
		Reference:        optionalPgText(in.Reference),
		CreatedByUserID:  pgtype.Int8{Int64: ownerUserID, Valid: true},
		PostedAt:         pgtype.Timestamptz{Time: effDate, Valid: true},
	})
	if err != nil {
		return OwnerTransferResult{}, fmt.Errorf("create to tx: %w", err)
	}

	if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
		ID:                  fromAcc.ID,
		WorkspaceID:         fromWS.ID,
		CurrentBalanceMinor: -amountMinor,
	}); err != nil {
		return OwnerTransferResult{}, err
	}
	if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
		ID:                  toAcc.ID,
		WorkspaceID:         toWS.ID,
		CurrentBalanceMinor: amountMinor,
	}); err != nil {
		return OwnerTransferResult{}, err
	}

	fromDebitClass, toCreditClass := ownerTransferLedgerClasses(fromWS.Kind, toWS.Kind, purpose)

	fromLE, err := postBalancedLedgerTx(
		ctx, qtx, fromWS.ID, "owner_transfer", fromTx.ID, effDate,
		currency, fromAcc.CurrencyExponent, fmt.Sprintf("Owner transfer (%s) to %s", purpose, toWS.Name),
		[]ledgerPostingLine{
			{AccountClass: fromDebitClass, DebitMinor: amountMinor, Description: "Owner transfer out: " + purpose},
			{AccountID: &fromAcc.ID, AccountClass: accountBalanceClass(fromAcc.AccountType), CreditMinor: amountMinor, Description: "Cash out for owner transfer"},
		},
	)
	if err != nil {
		return OwnerTransferResult{}, err
	}

	toLE, err := postBalancedLedgerTx(
		ctx, qtx, toWS.ID, "owner_transfer", toTx.ID, effDate,
		currency, toAcc.CurrencyExponent, fmt.Sprintf("Owner transfer (%s) from %s", purpose, fromWS.Name),
		[]ledgerPostingLine{
			{AccountID: &toAcc.ID, AccountClass: accountBalanceClass(toAcc.AccountType), DebitMinor: amountMinor, Description: "Cash in from owner transfer"},
			{AccountClass: toCreditClass, CreditMinor: amountMinor, Description: "Owner transfer in: " + purpose},
		},
	)
	if err != nil {
		return OwnerTransferResult{}, err
	}

	group, err := qtx.CreateOwnerTransferGroup(ctx, db.CreateOwnerTransferGroupParams{
		OwnerUserID:            ownerUserID,
		FromWorkspaceID:        fromWS.ID,
		ToWorkspaceID:          toWS.ID,
		FromMoneyAccountID:     fromAcc.ID,
		ToMoneyAccountID:       toAcc.ID,
		Purpose:                purpose,
		AmountMinor:            amountMinor,
		Currency:               currency,
		CurrencyExponent:       fromAcc.CurrencyExponent,
		EffectiveDate:          pgtype.Date{Time: effDate, Valid: true},
		FromMoneyTransactionID: pgtype.Int8{Int64: fromTx.ID, Valid: true},
		ToMoneyTransactionID:   pgtype.Int8{Int64: toTx.ID, Valid: true},
		FromLedgerEntryID:      pgtype.Int8{Int64: fromLE.ID, Valid: true},
		ToLedgerEntryID:        pgtype.Int8{Int64: toLE.ID, Valid: true},
		Notes:                  optionalPgText(in.Notes),
		Reference:              optionalPgText(in.Reference),
		Status:                 "posted",
		IdempotencyKey:         idempKey,
	})
	if err != nil {
		return OwnerTransferResult{}, fmt.Errorf("create owner transfer group: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return OwnerTransferResult{}, fmt.Errorf("commit owner transfer: %w", err)
	}
	return OwnerTransferResult{
		Group:           group,
		FromTransaction: fromTx,
		ToTransaction:   toTx,
		WasDuplicate:    false,
	}, nil
}

func (s *Service) ListOwnerTransfers(ctx context.Context, ownerUserID int64) ([]db.OwnerTransferGroup, error) {
	return s.queries.ListOwnerTransferGroupsByOwner(ctx, db.ListOwnerTransferGroupsByOwnerParams{
		OwnerUserID: ownerUserID,
		Limit:       50,
	})
}

// ---------------- All Owner Summary ----------------

type WorkspaceSummaryProjection struct {
	WorkspaceID      int64  `json:"workspace_id"`
	WorkspaceName    string `json:"workspace_name"`
	Kind             string `json:"kind"`
	Currency         string `json:"currency"`
	CurrencyExponent int    `json:"currency_exponent"`
	CashBalanceMinor int64  `json:"cash_balance_minor,string"`
	CashInflowMinor  int64  `json:"cash_inflow_minor,string"`
	CashOutflowMinor int64  `json:"cash_outflow_minor,string"`
	IncomeMinor      int64  `json:"income_minor,string"`
	ExpenseMinor     int64  `json:"expense_minor,string"`
}

type CombinedCurrencyProjection struct {
	Currency                string `json:"currency"`
	CurrencyExponent        int    `json:"currency_exponent"`
	CombinedCashMinor       int64  `json:"combined_cash_balance_minor,string"`
	RawInflowMinor          int64  `json:"raw_inflow_minor,string"`
	RawOutflowMinor         int64  `json:"raw_outflow_minor,string"`
	EliminatedTransferMinor int64  `json:"eliminated_transfer_minor,string"`
	NetCashInflowMinor      int64  `json:"combined_inflow_minor,string"`
	NetCashOutflowMinor     int64  `json:"combined_outflow_minor,string"`
	NetCashMovementMinor    int64  `json:"combined_net_cash_movement_minor,string"`
}

type AllOwnerSummary struct {
	FromDate             string                       `json:"from_date"`
	ToDate               string                       `json:"to_date"`
	AsOf                 string                       `json:"as_of"`
	Workspaces           []WorkspaceSummaryProjection `json:"workspaces"`
	CombinedByCurrency   []CombinedCurrencyProjection `json:"combined_by_currency"`
	ExcludesInvitedData  bool                         `json:"excludes_invited_business_data"`
	RequiresTargetToPost bool                         `json:"requires_target_workspace_to_post"`
	ProjectionNote       string                       `json:"projection_note"`
}

func (s *Service) GetAllOwnerSummary(ctx context.Context, ownerUserID int64, fromDateStr, toDateStr string) (AllOwnerSummary, error) {
	now := time.Now().UTC()
	from, to, err := resolveSummaryWindow(fromDateStr, toDateStr, now)
	if err != nil {
		return AllOwnerSummary{}, err
	}

	workspaces, err := s.queries.ListOwnedWorkspacesByUser(ctx, ownerUserID)
	if err != nil {
		return AllOwnerSummary{}, err
	}

	wsIDs := make([]int64, 0, len(workspaces))
	projections := make([]WorkspaceSummaryProjection, 0, len(workspaces))
	byCurr := map[string]*CombinedCurrencyProjection{}

	for _, ws := range workspaces {
		wsIDs = append(wsIDs, ws.ID)
		curr := ws.BaseCurrency
		if curr == "" {
			curr = "NGN"
		}
		exp := CurrencyExponent(curr)

		cashMov, err := s.queries.GetPersonalPeriodCashMovement(ctx, db.GetPersonalPeriodCashMovementParams{
			WorkspaceID: ws.ID,
			Currency:    curr,
			FromDate:    pgtype.Date{Time: from, Valid: true},
			ToDate:      pgtype.Date{Time: to, Valid: true},
		})
		if err != nil {
			return AllOwnerSummary{}, err
		}

		incExp, err := s.queries.GetPersonalPeriodIncomeExpense(ctx, db.GetPersonalPeriodIncomeExpenseParams{
			WorkspaceID: ws.ID,
			Currency:    curr,
			FromDate:    pgtype.Date{Time: from, Valid: true},
			ToDate:      pgtype.Date{Time: to, Valid: true},
		})
		if err != nil {
			return AllOwnerSummary{}, err
		}

		accounts, err := s.ListAccountsOrdered(ctx, ws.ID, nil)
		if err != nil {
			return AllOwnerSummary{}, err
		}
		var cashBal int64
		for _, a := range accounts {
			if a.Currency == curr {
				cashBal += a.CurrentBalanceMinor
			}
		}

		projections = append(projections, WorkspaceSummaryProjection{
			WorkspaceID:      ws.ID,
			WorkspaceName:    ws.Name,
			Kind:             ws.Kind,
			Currency:         curr,
			CurrencyExponent: exp,
			CashBalanceMinor: cashBal,
			CashInflowMinor:  cashMov.CashInflowMinor,
			CashOutflowMinor: cashMov.CashOutflowMinor,
			IncomeMinor:      incExp.IncomeMinor,
			ExpenseMinor:     incExp.ExpenseMinor,
		})

		agg, ok := byCurr[curr]
		if !ok {
			agg = &CombinedCurrencyProjection{Currency: curr, CurrencyExponent: exp}
			byCurr[curr] = agg
		}
		agg.CombinedCashMinor += cashBal
		agg.RawInflowMinor += cashMov.CashInflowMinor
		agg.RawOutflowMinor += cashMov.CashOutflowMinor
	}

	combined := make([]CombinedCurrencyProjection, 0, len(byCurr))
	for curr, agg := range byCurr {
		elim, err := s.queries.SumOwnerTransfersForWorkspaces(ctx, db.SumOwnerTransfersForWorkspacesParams{
			OwnerUserID:  ownerUserID,
			Currency:     curr,
			FromDate:     pgtype.Date{Time: from, Valid: true},
			ToDate:       pgtype.Date{Time: to, Valid: true},
			WorkspaceIds: wsIDs,
		})
		if err != nil {
			return AllOwnerSummary{}, err
		}
		agg.EliminatedTransferMinor = elim
		agg.NetCashInflowMinor = agg.RawInflowMinor - elim
		agg.NetCashOutflowMinor = agg.RawOutflowMinor - elim
		agg.NetCashMovementMinor = agg.NetCashInflowMinor - agg.NetCashOutflowMinor
		combined = append(combined, *agg)
	}

	return AllOwnerSummary{
		FromDate:             from.Format("2006-01-02"),
		ToDate:               to.Format("2006-01-02"),
		AsOf:                 now.Format(time.RFC3339),
		Workspaces:           projections,
		CombinedByCurrency:   combined,
		ExcludesInvitedData:  true,
		RequiresTargetToPost: true,
		ProjectionNote:       "Rebuildable owner projection across owned spaces only. Mirrored internal owner transfers are eliminated from combined cash flow; ledgers remain strictly separate.",
	}, nil
}
