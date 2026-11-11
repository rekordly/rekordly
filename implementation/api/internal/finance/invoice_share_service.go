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
	WorkspaceName string           `json:"workspace_name"`
	Invoice       db.Invoice       `json:"invoice"`
	Items         []db.InvoiceItem `json:"items"`
	ExpiresAt     time.Time        `json:"expires_at"`
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

	return PublicInvoiceView{
		WorkspaceName: wsName,
		Invoice:       inv,
		Items:         items,
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
