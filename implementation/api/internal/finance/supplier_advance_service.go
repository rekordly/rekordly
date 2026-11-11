package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var ErrSupplierAdvanceInsufficient = errors.New("supplier advance has insufficient available balance")

type CreateSupplierAdvanceInput struct {
	SupplierID     int64             `json:"supplier_id" binding:"required"`
	PaymentDate    string            `json:"payment_date" binding:"required"`
	Amount         string            `json:"amount" binding:"required"`
	Currency       string            `json:"currency"`
	PaymentLegs    []PaymentLegInput `json:"payment_legs" binding:"required"`
	Notes          string            `json:"notes"`
	Reference      string            `json:"reference"`
	IdempotencyKey string            `json:"idempotency_key"`
}

type ApplySupplierAdvanceInput struct {
	SupplierBillID         int64  `json:"supplier_bill_id" binding:"required"`
	Amount                 string `json:"amount" binding:"required"`
	ExpectedAdvanceVersion int32  `json:"expected_advance_version" binding:"required"`
	ExpectedBillVersion    int32  `json:"expected_bill_version" binding:"required"`
	IdempotencyKey         string `json:"idempotency_key"`
}

type SupplierAdvanceView struct {
	ID               int64  `json:"id"`
	SupplierID       int64  `json:"supplier_id"`
	PaymentID        int64  `json:"payment_id"`
	Currency         string `json:"currency"`
	CurrencyExponent int32  `json:"currency_exponent"`
	OriginalMinor    string `json:"original_minor"`
	AvailableMinor   string `json:"available_minor"`
	Status           string `json:"status"`
	Version          int32  `json:"version"`
}

type SupplierAdvanceApplicationView struct {
	ID                int64               `json:"id"`
	SupplierAdvanceID int64               `json:"supplier_advance_id"`
	SupplierBillID    int64               `json:"supplier_bill_id"`
	AmountMinor       string              `json:"amount_minor"`
	Advance           SupplierAdvanceView `json:"advance"`
	Bill              SupplierBillView    `json:"bill"`
}

func supplierAdvanceView(advance db.SupplierAdvance) SupplierAdvanceView {
	return SupplierAdvanceView{
		ID: advance.ID, SupplierID: advance.SupplierID, PaymentID: advance.PaymentID,
		Currency: advance.Currency, CurrencyExponent: advance.CurrencyExponent,
		OriginalMinor: fmt.Sprint(advance.OriginalMinor), AvailableMinor: fmt.Sprint(advance.AvailableMinor),
		Status: advance.Status, Version: advance.Version,
	}
}

// CreateSupplierAdvance posts cash once (debit Supplier Advances, credit
// cash/bank), then creates its subledger row in the same transaction. It is
// deliberately not a purchase, receipt, bill, or AP settlement.
func (s *Service) CreateSupplierAdvance(ctx context.Context, workspaceID, userID int64, in CreateSupplierAdvanceInput) (SupplierAdvanceView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if in.SupplierID <= 0 || key == "" || len(key) > 200 {
		return SupplierAdvanceView{}, errors.New("supplier, payment details and idempotency key are required")
	}
	if prior, err := s.queries.GetSupplierAdvanceByIdempotency(ctx, db.GetSupplierAdvanceByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: pgtype.Text{String: key, Valid: true}}); err == nil {
		return supplierAdvanceView(prior), nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SupplierAdvanceView{}, err
	}
	if _, err := s.queries.GetPaymentByIdempotency(ctx, db.GetPaymentByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: pgtype.Text{String: key, Valid: true}}); err == nil {
		return SupplierAdvanceView{}, ErrDuplicateIdempotent
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SupplierAdvanceView{}, err
	}
	party, err := s.GetCounterparty(ctx, workspaceID, in.SupplierID)
	if err != nil || (party.PartyType != "supplier" && party.PartyType != "both") {
		return SupplierAdvanceView{}, ErrForbiddenParty
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SupplierAdvanceView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)
	payment, err := s.createPaymentInternal(ctx, qtx, workspaceID, userID, CreatePaymentInput{
		Direction: "outgoing", PaymentDate: in.PaymentDate, TotalAmount: in.Amount,
		Currency: in.Currency, CounterpartyID: &in.SupplierID, CounterpartyName: party.Name,
		PaymentLegs: in.PaymentLegs, Notes: in.Notes, Reference: in.Reference,
		IdempotencyKey: key, SupplierAdvance: true,
	})
	if err != nil {
		return SupplierAdvanceView{}, err
	}
	advance, err := qtx.CreateSupplierAdvance(ctx, db.CreateSupplierAdvanceParams{
		WorkspaceID: workspaceID, SupplierID: party.ID, PaymentID: payment.Payment.ID,
		Currency: payment.Payment.Currency, CurrencyExponent: payment.Payment.CurrencyExponent,
		OriginalMinor: payment.Payment.TotalAmountMinor, CreatedByUserID: userID,
	})
	if err != nil {
		return SupplierAdvanceView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SupplierAdvanceView{}, err
	}
	return supplierAdvanceView(advance), nil
}

func (s *Service) ListSupplierAdvances(ctx context.Context, workspaceID int64) ([]SupplierAdvanceView, error) {
	rows, err := s.queries.ListSupplierAdvances(ctx, db.ListSupplierAdvancesParams{WorkspaceID: workspaceID, Limit: 50})
	if err != nil {
		return nil, err
	}
	result := make([]SupplierAdvanceView, 0, len(rows))
	for _, advance := range rows {
		result = append(result, supplierAdvanceView(advance))
	}
	return result, nil
}

// ApplySupplierAdvance is intentionally a non-cash settlement: it debits AP
// and credits the already-recorded supplier-advance asset. Both balances and
// the application record are updated atomically.
func (s *Service) ApplySupplierAdvance(ctx context.Context, workspaceID, userID, advanceID int64, in ApplySupplierAdvanceInput) (SupplierAdvanceApplicationView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if advanceID <= 0 || in.SupplierBillID <= 0 || in.ExpectedAdvanceVersion <= 0 || in.ExpectedBillVersion <= 0 || key == "" || len(key) > 200 {
		return SupplierAdvanceApplicationView{}, errors.New("advance, bill, versions and idempotency key are required")
	}
	if previous, err := s.queries.GetSupplierAdvanceApplicationByIdempotency(ctx, db.GetSupplierAdvanceApplicationByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: key}); err == nil {
		if previous.SupplierAdvanceID != advanceID || previous.SupplierBillID != in.SupplierBillID {
			return SupplierAdvanceApplicationView{}, ErrDuplicateIdempotent
		}
		advance, getAdvanceErr := s.queries.GetSupplierAdvanceByID(ctx, db.GetSupplierAdvanceByIDParams{WorkspaceID: workspaceID, ID: advanceID})
		bill, getBillErr := s.queries.GetSupplierBill(ctx, db.GetSupplierBillParams{WorkspaceID: workspaceID, ID: in.SupplierBillID})
		if getAdvanceErr != nil || getBillErr != nil {
			return SupplierAdvanceApplicationView{}, ErrNotFound
		}
		return SupplierAdvanceApplicationView{ID: previous.ID, SupplierAdvanceID: advanceID, SupplierBillID: in.SupplierBillID, AmountMinor: fmt.Sprint(previous.AmountMinor), Advance: supplierAdvanceView(advance), Bill: billView(bill)}, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SupplierAdvanceApplicationView{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)
	// Lock a bill before the advance. Concurrent normal payments only lock the
	// bill, while applications against different bills serialize on the advance.
	bill, err := qtx.GetSupplierBillForUpdate(ctx, db.GetSupplierBillForUpdateParams{WorkspaceID: workspaceID, ID: in.SupplierBillID})
	if errors.Is(err, pgx.ErrNoRows) {
		return SupplierAdvanceApplicationView{}, ErrNotFound
	}
	if err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	advance, err := qtx.GetSupplierAdvanceForUpdate(ctx, db.GetSupplierAdvanceForUpdateParams{WorkspaceID: workspaceID, ID: advanceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return SupplierAdvanceApplicationView{}, ErrNotFound
	}
	if err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	if prior, err := qtx.GetSupplierAdvanceApplicationByIdempotency(ctx, db.GetSupplierAdvanceApplicationByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: key}); err == nil {
		if prior.SupplierAdvanceID != advanceID || prior.SupplierBillID != in.SupplierBillID {
			return SupplierAdvanceApplicationView{}, ErrDuplicateIdempotent
		}
		return SupplierAdvanceApplicationView{ID: prior.ID, SupplierAdvanceID: advanceID, SupplierBillID: in.SupplierBillID, AmountMinor: fmt.Sprint(prior.AmountMinor), Advance: supplierAdvanceView(advance), Bill: billView(bill)}, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SupplierAdvanceApplicationView{}, err
	}
	if advance.Version != in.ExpectedAdvanceVersion || bill.Version != in.ExpectedBillVersion {
		return SupplierAdvanceApplicationView{}, ErrPurchaseRequestVersion
	}
	if advance.SupplierID != bill.SupplierID || advance.Currency != bill.Currency {
		return SupplierAdvanceApplicationView{}, ErrForbiddenParty
	}
	if bill.Status != "approved" && bill.Status != "partially_paid" {
		return SupplierAdvanceApplicationView{}, ErrInvalidPurchaseRequestState
	}
	amount, err := ParseMajorToMinor(in.Amount, int(advance.CurrencyExponent))
	if err != nil || amount <= 0 {
		return SupplierAdvanceApplicationView{}, ErrNegativeAmount
	}
	if amount > advance.AvailableMinor {
		return SupplierAdvanceApplicationView{}, ErrSupplierAdvanceInsufficient
	}
	if amount > bill.OutstandingMinor {
		return SupplierAdvanceApplicationView{}, ErrOverpayment
	}
	updatedAdvance, err := qtx.ApplySupplierAdvance(ctx, db.ApplySupplierAdvanceParams{WorkspaceID: workspaceID, ID: advanceID, AvailableMinor: amount})
	if errors.Is(err, pgx.ErrNoRows) {
		return SupplierAdvanceApplicationView{}, ErrSupplierAdvanceInsufficient
	}
	if err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	updatedBill, err := qtx.SettleSupplierBill(ctx, db.SettleSupplierBillParams{WorkspaceID: workspaceID, ID: bill.ID, OutstandingMinor: amount})
	if errors.Is(err, pgx.ErrNoRows) {
		return SupplierAdvanceApplicationView{}, ErrOverpayment
	}
	if err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	application, err := qtx.CreateSupplierAdvanceApplication(ctx, db.CreateSupplierAdvanceApplicationParams{WorkspaceID: workspaceID, SupplierAdvanceID: advanceID, SupplierBillID: bill.ID, AmountMinor: amount, IdempotencyKey: key, CreatedByUserID: userID})
	if err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	entry, err := qtx.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: workspaceID, SourceType: "supplier_advance_application", SourceID: application.ID, EntryDate: pgtype.Date{Time: time.Now().UTC(), Valid: true}, Currency: advance.Currency, CurrencyExponent: advance.CurrencyExponent, Description: optionalPgText("Apply supplier advance to AP")})
	if err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	if _, err = qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "liability", DebitMinor: amount, Description: optionalPgText("Accounts Payable settled by supplier advance")}); err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	if _, err = qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "asset", CreditMinor: amount, Description: optionalPgText("Supplier advance applied")}); err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SupplierAdvanceApplicationView{}, err
	}
	return SupplierAdvanceApplicationView{ID: application.ID, SupplierAdvanceID: advanceID, SupplierBillID: bill.ID, AmountMinor: fmt.Sprint(amount), Advance: supplierAdvanceView(updatedAdvance), Bill: billView(updatedBill)}, nil
}
