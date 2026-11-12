package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrShareNotFoundOrExpired = errors.New("invoice share link not found or has expired")
	ErrReceiptNotFound        = errors.New("payment receipt not found")
)

type PublicInvoiceView struct {
	WorkspaceName string              `json:"workspace_name"`
	Invoice       db.Invoice          `json:"invoice"`
	Items         []db.InvoiceItem    `json:"items"`
	TaxLines      []db.InvoiceTaxLine `json:"tax_lines,omitempty"`
	ExpiresAt     time.Time           `json:"expires_at"`
}

type PublicReceiptView struct {
	WorkspaceName string            `json:"workspace_name"`
	Receipt       db.PaymentReceipt `json:"receipt"`
	Payment       db.Payment        `json:"payment"`
	Invoice       *db.Invoice       `json:"invoice,omitempty"`
}

func (s *Service) CreateInvoiceShare(ctx context.Context, workspaceID, invoiceID int64, expiryDays int) (string, db.InvoiceShare, error) {
	// Verify invoice belongs to workspace
	inv, err := s.queries.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{
		ID:          invoiceID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return "", db.InvoiceShare{}, err
	}

	if expiryDays <= 0 {
		expiryDays = 30
	}
	expiresAt := time.Now().AddDate(0, 0, expiryDays)

	// Generate 32 bytes random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", db.InvoiceShare{}, fmt.Errorf("failed to generate random share token: %w", err)
	}
	rawToken := hex.EncodeToString(tokenBytes)
	hash := hashToken(rawToken)

	share, err := s.queries.CreateInvoiceShare(ctx, db.CreateInvoiceShareParams{
		WorkspaceID: workspaceID,
		InvoiceID:   inv.ID,
		TokenHash:   hash,
		ExpiresAt:   pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return "", db.InvoiceShare{}, fmt.Errorf("failed to create invoice share: %w", err)
	}

	return rawToken, share, nil
}

func (s *Service) GetPublicInvoice(ctx context.Context, rawToken string) (PublicInvoiceView, error) {
	hash := hashToken(rawToken)

	share, err := s.queries.GetInvoiceShareByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PublicInvoiceView{}, ErrShareNotFoundOrExpired
		}
		return PublicInvoiceView{}, err
	}

	// Increment access count in background
	go func(shareID int64) {
		_ = s.queries.IncrementInvoiceShareAccess(context.Background(), shareID)
	}(share.ID)

	inv, err := s.queries.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{
		ID:          share.InvoiceID,
		WorkspaceID: share.WorkspaceID,
	})
	if err != nil {
		return PublicInvoiceView{}, err
	}

	items, err := s.queries.ListInvoiceItemsByInvoiceID(ctx, db.ListInvoiceItemsByInvoiceIDParams{
		InvoiceID:   inv.ID,
		WorkspaceID: share.WorkspaceID,
	})
	if err != nil {
		return PublicInvoiceView{}, err
	}

	wsName := "Rekordly Merchant"
	var name string
	err = s.pool.QueryRow(ctx, `SELECT name FROM workspaces WHERE id = $1`, share.WorkspaceID).Scan(&name)
	if err == nil && name != "" {
		wsName = name
	}

	taxLines, _ := s.queries.ListInvoiceTaxLines(ctx, db.ListInvoiceTaxLinesParams{
		InvoiceID:   inv.ID,
		WorkspaceID: share.WorkspaceID,
	})

	return PublicInvoiceView{
		WorkspaceName: wsName,
		Invoice:       inv,
		Items:         items,
		TaxLines:      taxLines,
		ExpiresAt:     share.ExpiresAt.Time,
	}, nil
}

func (s *Service) CreatePaymentReceipt(ctx context.Context, workspaceID, paymentID int64) (string, db.PaymentReceipt, error) {
	// Check if receipt already exists
	existing, err := s.queries.GetPaymentReceiptByPaymentID(ctx, db.GetPaymentReceiptByPaymentIDParams{
		WorkspaceID: workspaceID,
		PaymentID:   paymentID,
	})
	if err == nil {
		// Receipt exists, regenerate a fresh access token for it
		tokenBytes := make([]byte, 32)
		_, _ = rand.Read(tokenBytes)
		rawToken := hex.EncodeToString(tokenBytes)
		hash := hashToken(rawToken)
		_, _ = s.pool.Exec(ctx, `UPDATE payment_receipts SET token_hash = $1 WHERE id = $2`, hash, existing.ID)
		existing.TokenHash = hash
		return rawToken, existing, nil
	}

	pay, err := s.queries.GetPaymentByID(ctx, db.GetPaymentByIDParams{
		ID:          paymentID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return "", db.PaymentReceipt{}, err
	}

	// Generate receipt number
	var count int64
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM payment_receipts WHERE workspace_id = $1`, workspaceID).Scan(&count)
	recNum := fmt.Sprintf("REC-%s-%04d", time.Now().Format("200601"), count+1)

	var invoiceID pgtype.Int8
	if pay.LinkedRecordType.Valid && pay.LinkedRecordType.String == "invoice" && pay.LinkedRecordID.Valid {
		invoiceID = pgtype.Int8{Int64: pay.LinkedRecordID.Int64, Valid: true}
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", db.PaymentReceipt{}, fmt.Errorf("failed to generate random receipt token: %w", err)
	}
	rawToken := hex.EncodeToString(tokenBytes)
	hash := hashToken(rawToken)

	receipt, err := s.queries.CreatePaymentReceipt(ctx, db.CreatePaymentReceiptParams{
		WorkspaceID:   workspaceID,
		ReceiptNumber: recNum,
		PaymentID:     pay.ID,
		InvoiceID:     invoiceID,
		AmountMinor:   pay.TotalAmountMinor,
		Currency:      pay.Currency,
		TokenHash:     hash,
		IssuedAt:      pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return "", db.PaymentReceipt{}, fmt.Errorf("failed to create payment receipt: %w", err)
	}

	return rawToken, receipt, nil
}

func (s *Service) GetPublicReceipt(ctx context.Context, rawToken string) (PublicReceiptView, error) {
	hash := hashToken(rawToken)

	rec, err := s.queries.GetPaymentReceiptByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PublicReceiptView{}, ErrReceiptNotFound
		}
		return PublicReceiptView{}, err
	}

	pay, err := s.queries.GetPaymentByID(ctx, db.GetPaymentByIDParams{
		ID:          rec.PaymentID,
		WorkspaceID: rec.WorkspaceID,
	})
	if err != nil {
		return PublicReceiptView{}, err
	}

	var linkedInvoice *db.Invoice
	if rec.InvoiceID.Valid {
		inv, err := s.queries.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{
			ID:          rec.InvoiceID.Int64,
			WorkspaceID: rec.WorkspaceID,
		})
		if err == nil {
			linkedInvoice = &inv
		}
	}

	wsName := "Rekordly Merchant"
	var name string
	err = s.pool.QueryRow(ctx, `SELECT name FROM workspaces WHERE id = $1`, rec.WorkspaceID).Scan(&name)
	if err == nil && name != "" {
		wsName = name
	}

	return PublicReceiptView{
		WorkspaceName: wsName,
		Receipt:       rec,
		Payment:       pay,
		Invoice:       linkedInvoice,
	}, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

type PublicEstimateView struct {
	WorkspaceName  string            `json:"workspace_name"`
	Estimate       db.Estimate       `json:"estimate"`
	Items          []db.EstimateItem `json:"items"`
	AllowRespond   bool              `json:"allow_respond"`
	ResponseStatus string            `json:"response_status,omitempty"`
	ExpiresAt      time.Time         `json:"expires_at"`
}

func (s *Service) CreateEstimateShare(ctx context.Context, workspaceID, estimateID, userID int64, expiryDays int, allowRespond bool) (string, db.EstimateShare, error) {
	est, err := s.queries.GetEstimateByID(ctx, db.GetEstimateByIDParams{
		ID:          estimateID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return "", db.EstimateShare{}, err
	}

	if expiryDays <= 0 {
		expiryDays = 30
	}
	expiresAt := time.Now().AddDate(0, 0, expiryDays)

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", db.EstimateShare{}, fmt.Errorf("failed to generate token: %w", err)
	}
	rawToken := hex.EncodeToString(tokenBytes)
	hash := hashToken(rawToken)

	share, err := s.queries.CreateEstimateShare(ctx, db.CreateEstimateShareParams{
		WorkspaceID:     workspaceID,
		EstimateID:      est.ID,
		TokenHash:       hash,
		AllowRespond:    allowRespond,
		ExpiresAt:       pgtype.Timestamptz{Time: expiresAt, Valid: true},
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return "", db.EstimateShare{}, fmt.Errorf("create estimate share: %w", err)
	}
	return rawToken, share, nil
}

func (s *Service) GetPublicEstimate(ctx context.Context, rawToken string) (PublicEstimateView, error) {
	hash := hashToken(rawToken)
	share, err := s.queries.GetEstimateShareByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PublicEstimateView{}, ErrShareNotFoundOrExpired
		}
		return PublicEstimateView{}, err
	}

	go func(shareID int64) {
		_ = s.queries.IncrementEstimateShareAccess(context.Background(), shareID)
	}(share.ID)

	est, err := s.queries.GetEstimateByID(ctx, db.GetEstimateByIDParams{
		ID:          share.EstimateID,
		WorkspaceID: share.WorkspaceID,
	})
	if err != nil {
		return PublicEstimateView{}, err
	}

	items, err := s.queries.ListEstimateItems(ctx, db.ListEstimateItemsParams{
		EstimateID:  est.ID,
		WorkspaceID: share.WorkspaceID,
	})
	if err != nil {
		return PublicEstimateView{}, err
	}

	wsName := "Rekordly Merchant"
	var name string
	if err := s.pool.QueryRow(ctx, `SELECT name FROM workspaces WHERE id = $1`, share.WorkspaceID).Scan(&name); err == nil && name != "" {
		wsName = name
	}

	return PublicEstimateView{
		WorkspaceName:  wsName,
		Estimate:       est,
		Items:          items,
		AllowRespond:   share.AllowRespond,
		ResponseStatus: share.ResponseStatus.String,
		ExpiresAt:      share.ExpiresAt.Time,
	}, nil
}

func (s *Service) RespondPublicEstimate(ctx context.Context, rawToken, action, responderName, comment string) (db.Estimate, error) {
	if action != "accepted" && action != "declined" {
		return db.Estimate{}, errors.New("action must be accepted or declined")
	}
	hash := hashToken(rawToken)
	share, err := s.queries.GetEstimateShareByHash(ctx, hash)
	if err != nil {
		return db.Estimate{}, ErrShareNotFoundOrExpired
	}
	if !share.AllowRespond {
		return db.Estimate{}, errors.New("responding to this quotation is disabled")
	}
	if share.ResponseStatus.Valid {
		return db.Estimate{}, errors.New("quotation response already recorded")
	}

	est, err := s.queries.GetEstimateByID(ctx, db.GetEstimateByIDParams{
		ID:          share.EstimateID,
		WorkspaceID: share.WorkspaceID,
	})
	if err != nil {
		return db.Estimate{}, err
	}
	if est.Status == "converted" {
		return db.Estimate{}, ErrEstimateAlreadyConverted
	}

	if _, err := s.queries.RecordEstimateShareResponse(ctx, db.RecordEstimateShareResponseParams{
		ID:              share.ID,
		ResponseStatus:  pgtype.Text{String: action, Valid: true},
		RespondedByName: optionalPgText(responderName),
		ResponseComment: optionalPgText(comment),
	}); err != nil {
		return db.Estimate{}, err
	}

	updatedEst, err := s.queries.UpdateEstimateStatus(ctx, db.UpdateEstimateStatusParams{
		ID:          est.ID,
		WorkspaceID: share.WorkspaceID,
		Status:      action,
	})
	if err != nil {
		return db.Estimate{}, err
	}

	// Best-effort notification to workspace owner
	var ownerID int64
	if err := s.pool.QueryRow(ctx, `SELECT owner_user_id FROM workspaces WHERE id = $1`, share.WorkspaceID).Scan(&ownerID); err == nil && ownerID > 0 {
		_, _ = s.queries.CreateNotification(ctx, db.CreateNotificationParams{
			WorkspaceID: pgtype.Int8{Int64: share.WorkspaceID, Valid: true},
			UserID:      ownerID,
			Category:    "invoice",
			Title:       fmt.Sprintf("Quotation %s %s", est.EstimateNumber, action),
			Body:        fmt.Sprintf("%s %s quotation %s.", responderName, action, est.EstimateNumber),
			ActionUrl:   pgtype.Text{String: "/invoices", Valid: true},
		})
	}

	return updatedEst, nil
}

type PublicStatementView struct {
	WorkspaceName       string                 `json:"workspace_name"`
	Customer            db.Counterparty        `json:"customer"`
	OpeningBalanceMinor int64                  `json:"opening_balance_minor"`
	FromDate            string                 `json:"from_date,omitempty"`
	ToDate              string                 `json:"to_date,omitempty"`
	Invoices            []db.Invoice           `json:"invoices"`
	WalletTxs           []db.WalletTransaction `json:"wallet_txs"`
	ExpiresAt           time.Time              `json:"expires_at"`
}

func (s *Service) CreateCustomerStatementShare(ctx context.Context, workspaceID, customerID, userID int64, fromDate, toDate string, expiryDays int) (string, db.CustomerStatementShare, error) {
	cust, err := s.queries.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{
		ID:          customerID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return "", db.CustomerStatementShare{}, ErrNotFound
	}
	var fromPg, toPg pgtype.Date
	if fromDate != "" {
		if t, err := time.Parse("2006-01-02", fromDate); err == nil {
			fromPg = pgtype.Date{Time: t, Valid: true}
		}
	}
	if toDate != "" {
		if t, err := time.Parse("2006-01-02", toDate); err == nil {
			toPg = pgtype.Date{Time: t, Valid: true}
		}
	}
	if expiryDays <= 0 {
		expiryDays = 14
	}
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", db.CustomerStatementShare{}, err
	}
	rawToken := hex.EncodeToString(tokenBytes)

	share, err := s.queries.CreateCustomerStatementShare(ctx, db.CreateCustomerStatementShareParams{
		WorkspaceID:     workspaceID,
		CustomerID:      cust.ID,
		TokenHash:       hashToken(rawToken),
		FromDate:        fromPg,
		ToDate:          toPg,
		ExpiresAt:       pgtype.Timestamptz{Time: time.Now().AddDate(0, 0, expiryDays), Valid: true},
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return "", db.CustomerStatementShare{}, err
	}
	return rawToken, share, nil
}

func (s *Service) GetPublicCustomerStatement(ctx context.Context, rawToken string) (PublicStatementView, error) {
	share, err := s.queries.GetCustomerStatementShareByHash(ctx, hashToken(rawToken))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PublicStatementView{}, ErrShareNotFoundOrExpired
		}
		return PublicStatementView{}, err
	}

	go func(shareID int64) {
		_ = s.queries.IncrementCustomerStatementShareAccess(context.Background(), shareID)
	}(share.ID)

	cust, err := s.queries.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{
		ID:          share.CustomerID,
		WorkspaceID: share.WorkspaceID,
	})
	if err != nil {
		return PublicStatementView{}, err
	}

	invoices, _ := s.queries.ListInvoices(ctx, db.ListInvoicesParams{
		WorkspaceID: share.WorkspaceID,
		CustomerID:  pgtype.Int8{Int64: cust.ID, Valid: true},
		FromDate:    share.FromDate,
		ToDate:      share.ToDate,
		Limit:       200,
	})

	walletTxs, _ := s.queries.ListWalletTransactions(ctx, db.ListWalletTransactionsParams{
		WorkspaceID: share.WorkspaceID,
		CustomerID:  cust.ID,
		Limit:       200,
	})

	wsName := "Rekordly Merchant"
	var name string
	if err := s.pool.QueryRow(ctx, `SELECT name FROM workspaces WHERE id = $1`, share.WorkspaceID).Scan(&name); err == nil && name != "" {
		wsName = name
	}

	fromStr := ""
	if share.FromDate.Valid {
		fromStr = share.FromDate.Time.Format("2006-01-02")
	}
	toStr := ""
	if share.ToDate.Valid {
		toStr = share.ToDate.Time.Format("2006-01-02")
	}

	return PublicStatementView{
		WorkspaceName:       wsName,
		Customer:            cust,
		OpeningBalanceMinor: cust.OpeningBalanceMinor,
		FromDate:            fromStr,
		ToDate:              toStr,
		Invoices:            invoices,
		WalletTxs:           walletTxs,
		ExpiresAt:           share.ExpiresAt.Time,
	}, nil
}
