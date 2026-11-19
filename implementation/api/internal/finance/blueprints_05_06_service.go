package finance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

// TaxLineInput represents a single tax or compound tax line on an invoice or estimate.
type TaxLineInput struct {
	Name        string `json:"name" binding:"required"`
	RateBps     int32  `json:"rate_bps"`     // e.g. 750 = 7.50%
	AmountMinor int64  `json:"amount_minor"` // optional override when RateBps == 0
	Amount      string `json:"amount"`       // optional major decimal string when RateBps == 0
	IsCompound  bool   `json:"is_compound"`
}

type computedTaxLine struct {
	Name        string
	RateBps     int32
	AmountMinor int64
	IsCompound  bool
	SortOrder   int32
}

// ComputeMultiTaxLines calculates non-compound taxes on taxableBaseMinor first,
// then compound taxes on (taxableBaseMinor + nonCompoundTaxTotal), using exact integer half-up rounding.
func ComputeMultiTaxLines(inputs []TaxLineInput, taxableBaseMinor int64, exponent int) ([]computedTaxLine, int64, error) {
	if taxableBaseMinor < 0 {
		taxableBaseMinor = 0
	}
	var out []computedTaxLine
	var nonCompoundTotal int64
	var grandTotal int64

	// Pass 1: non-compound lines
	type indexed struct {
		idx int
		in  TaxLineInput
	}
	var compoundQueue []indexed

	for i, in := range inputs {
		name := strings.TrimSpace(in.Name)
		if name == "" {
			return nil, 0, errors.New("tax line name is required")
		}
		if in.RateBps < 0 || in.RateBps > 100000 {
			return nil, 0, errors.New("tax rate_bps must be between 0 and 100000")
		}
		if in.IsCompound {
			compoundQueue = append(compoundQueue, indexed{idx: i, in: in})
			continue
		}
		amt := in.AmountMinor
		if in.RateBps > 0 {
			amt = (taxableBaseMinor*int64(in.RateBps) + 5000) / 10000
		} else if amt == 0 && in.Amount != "" {
			parsed, err := ParseMajorToMinor(in.Amount, exponent)
			if err != nil {
				return nil, 0, fmt.Errorf("invalid tax line amount: %w", err)
			}
			amt = parsed
		}
		if amt < 0 {
			return nil, 0, errors.New("tax line amount cannot be negative")
		}
		nonCompoundTotal += amt
		grandTotal += amt
		out = append(out, computedTaxLine{
			Name:        name,
			RateBps:     in.RateBps,
			AmountMinor: amt,
			IsCompound:  false,
			SortOrder:   int32(i),
		})
	}

	// Pass 2: compound lines (tax-on-tax sequentially on cumulative base)
	compoundBase := taxableBaseMinor + nonCompoundTotal
	for _, item := range compoundQueue {
		in := item.in
		amt := in.AmountMinor
		if in.RateBps > 0 {
			amt = (compoundBase*int64(in.RateBps) + 5000) / 10000
		} else if amt == 0 && in.Amount != "" {
			parsed, err := ParseMajorToMinor(in.Amount, exponent)
			if err != nil {
				return nil, 0, fmt.Errorf("invalid compound tax amount: %w", err)
			}
			amt = parsed
		}
		if amt < 0 {
			return nil, 0, errors.New("tax line amount cannot be negative")
		}
		compoundBase += amt
		grandTotal += amt
		out = append(out, computedTaxLine{
			Name:        strings.TrimSpace(in.Name),
			RateBps:     in.RateBps,
			AmountMinor: amt,
			IsCompound:  true,
			SortOrder:   int32(item.idx),
		})
	}

	return out, grandTotal, nil
}

// recordDocumentVersion writes a point-in-time JSON snapshot of a sales document.
func (s *Service) recordDocumentVersion(ctx context.Context, qtx *db.Queries, workspaceID, userID int64, docType string, docID int64, summary string, payload any) error {
	nextVer, err := qtx.NextDocumentVersionNumber(ctx, db.NextDocumentVersionNumberParams{
		WorkspaceID:  workspaceID,
		DocumentType: docType,
		DocumentID:   docID,
	})
	if err != nil || nextVer <= 0 {
		nextVer = 1
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		raw = []byte(`{}`)
	}
	_, err = qtx.CreateDocumentVersion(ctx, db.CreateDocumentVersionParams{
		WorkspaceID:     workspaceID,
		DocumentType:    docType,
		DocumentID:      docID,
		VersionNumber:   nextVer,
		ChangeSummary:   summary,
		Snapshot:        raw,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: userID > 0},
	})
	return err
}

func (s *Service) ListDocumentVersions(ctx context.Context, workspaceID int64, docType string, docID int64) ([]db.DocumentVersion, error) {
	return s.queries.ListDocumentVersions(ctx, db.ListDocumentVersionsParams{
		WorkspaceID:  workspaceID,
		DocumentType: docType,
		DocumentID:   docID,
	})
}

// ConvertProformaToInvoice creates a standard finalized-ready draft/finalized invoice linked to a proforma invoice.
func (s *Service) ConvertProformaToInvoice(ctx context.Context, workspaceID, userID, proformaID int64, finalizeNow bool, idempotencyKey string) (InvoiceDetail, error) {
	orig, err := s.GetInvoice(ctx, workspaceID, proformaID)
	if err != nil {
		return InvoiceDetail{}, err
	}
	if orig.Invoice.DocumentKind != "proforma" {
		return InvoiceDetail{}, errors.New("only proforma invoices can be converted using this action")
	}
	if orig.Invoice.Status == "voided" {
		return InvoiceDetail{}, ErrCannotFinalizeVoided
	}

	var items []InvoiceItemInput
	for _, it := range orig.Items {
		items = append(items, InvoiceItemInput{
			Description:    it.Description,
			Quantity:       it.Quantity,
			UnitPriceMinor: it.UnitPriceMinor,
			DiscountMinor:  it.DiscountMinor,
		})
	}
	var taxInputs []TaxLineInput
	for _, tl := range orig.TaxLines {
		taxInputs = append(taxInputs, TaxLineInput{
			Name:        tl.Name,
			RateBps:     tl.RateBps,
			AmountMinor: tl.AmountMinor,
			IsCompound:  tl.IsCompound,
		})
	}

	status := "draft"
	if finalizeNow {
		status = "finalized"
	}
	return s.CreateInvoice(ctx, workspaceID, userID, CreateInvoiceInput{
		CustomerID:              orig.Invoice.CustomerID,
		CustomerName:            orig.Invoice.CustomerName,
		IssueDate:               time.Now().Format("2006-01-02"),
		DueDate:                 orig.Invoice.DueDate.Time.Format("2006-01-02"),
		TaxAmountMinor:          orig.Invoice.TaxAmountMinor,
		TaxLines:                taxInputs,
		DiscountMinor:           orig.Invoice.DiscountMinor,
		DeliveryFeeMinor:        orig.Invoice.DeliveryFeeMinor,
		Currency:                orig.Invoice.Currency,
		Status:                  status,
		DocumentKind:            "invoice",
		ConvertedFromProformaID: orig.Invoice.ID,
		Items:                   items,
		Notes:                   orig.Invoice.Notes.String,
		Terms:                   orig.Invoice.Terms.String,
		IdempotencyKey:          idempotencyKey,
	})
}

// ---------------- Debit Notes (Blueprint 06) ----------------

type DebitNoteItemInput struct {
	Description    string `json:"description" binding:"required"`
	Quantity       int32  `json:"quantity" binding:"required"`
	UnitPriceMinor int64  `json:"unit_price_minor"`
	UnitPrice      string `json:"unit_price"`
}

type CreateDebitNoteInput struct {
	InvoiceID      int64                `json:"invoice_id"`
	CustomerID     int64                `json:"customer_id"`
	IssueDate      string               `json:"issue_date" binding:"required"`
	TaxAmountMinor int64                `json:"tax_amount_minor"`
	TaxAmount      string               `json:"tax_amount"`
	Currency       string               `json:"currency"`
	Status         string               `json:"status"` // draft or issued
	Reason         string               `json:"reason"`
	Notes          string               `json:"notes"`
	Items          []DebitNoteItemInput `json:"items" binding:"required"`
	IdempotencyKey string               `json:"idempotency_key"`
}

type DebitNoteDetail struct {
	DebitNote db.DebitNote       `json:"debit_note"`
	Items     []db.DebitNoteItem `json:"items"`
}

func (s *Service) CreateDebitNote(ctx context.Context, workspaceID, userID int64, in CreateDebitNoteInput) (DebitNoteDetail, error) {
	idempKey := strings.TrimSpace(in.IdempotencyKey)
	if idempKey != "" {
		existing, err := s.queries.GetDebitNoteByIdempotency(ctx, db.GetDebitNoteByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			items, _ := s.queries.ListDebitNoteItems(ctx, db.ListDebitNoteItemsParams{DebitNoteID: existing.ID, WorkspaceID: workspaceID})
			return DebitNoteDetail{DebitNote: existing, Items: items}, nil
		}
	}
	if len(in.Items) == 0 {
		return DebitNoteDetail{}, errors.New("debit note requires at least one item")
	}

	var custID int64 = in.CustomerID
	var invParam pgtype.Int8
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if in.InvoiceID > 0 {
		inv, err := s.queries.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{ID: in.InvoiceID, WorkspaceID: workspaceID})
		if err != nil {
			return DebitNoteDetail{}, ErrNotFound
		}
		invParam = pgtype.Int8{Int64: inv.ID, Valid: true}
		if custID <= 0 {
			custID = inv.CustomerID
		}
		if currency == "" {
			currency = inv.Currency
		}
	}
	if currency == "" {
		currency = "NGN"
	}
	exponent := CurrencyExponent(currency)

	party, err := s.queries.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{ID: custID, WorkspaceID: workspaceID})
	if err != nil {
		return DebitNoteDetail{}, ErrForbiddenParty
	}
	issueDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.IssueDate))
	if err != nil {
		return DebitNoteDetail{}, errors.New("invalid issue_date (expected YYYY-MM-DD)")
	}

	type comp struct {
		desc  string
		qty   int32
		price int64
		amt   int64
	}
	var lines []comp
	var subtotal int64
	for _, it := range in.Items {
		desc := strings.TrimSpace(it.Description)
		if desc == "" || it.Quantity <= 0 {
			return DebitNoteDetail{}, errors.New("invalid debit note item description or quantity")
		}
		price := it.UnitPriceMinor
		if it.UnitPrice != "" {
			p, pErr := ParseMajorToMinor(it.UnitPrice, exponent)
			if pErr != nil {
				return DebitNoteDetail{}, pErr
			}
			price = p
		}
		if price < 0 {
			return DebitNoteDetail{}, errors.New("unit price cannot be negative")
		}
		amt := int64(it.Quantity) * price
		subtotal += amt
		lines = append(lines, comp{desc: desc, qty: it.Quantity, price: price, amt: amt})
	}

	taxMinor := in.TaxAmountMinor
	if in.TaxAmount != "" {
		p, pErr := ParseMajorToMinor(in.TaxAmount, exponent)
		if pErr != nil {
			return DebitNoteDetail{}, pErr
		}
		taxMinor = p
	}
	totalMinor := subtotal + taxMinor
	status := strings.ToLower(strings.TrimSpace(in.Status))
	if status == "" {
		status = "issued"
	}
	if status != "draft" && status != "issued" {
		return DebitNoteDetail{}, errors.New("debit note status must be draft or issued")
	}

	dnNumber := fmt.Sprintf("DN-%d", time.Now().UnixNano()%1000000)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DebitNoteDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	dn, err := qtx.CreateDebitNote(ctx, db.CreateDebitNoteParams{
		WorkspaceID:      workspaceID,
		DebitNoteNumber:  dnNumber,
		InvoiceID:        invParam,
		CustomerID:       party.ID,
		CustomerName:     party.Name,
		IssueDate:        pgtype.Date{Time: issueDate, Valid: true},
		Currency:         currency,
		CurrencyExponent: int16(exponent),
		SubtotalMinor:    subtotal,
		TaxAmountMinor:   taxMinor,
		TotalAmountMinor: totalMinor,
		Status:           status,
		Reason:           optionalPgText(in.Reason),
		Notes:            optionalPgText(in.Notes),
		CreatedByUserID:  userID,
		IdempotencyKey:   optionalPgText(idempKey),
	})
	if err != nil {
		return DebitNoteDetail{}, err
	}

	var saved []db.DebitNoteItem
	for _, l := range lines {
		rec, iErr := qtx.CreateDebitNoteItem(ctx, db.CreateDebitNoteItemParams{
			DebitNoteID:    dn.ID,
			WorkspaceID:    workspaceID,
			Description:    l.desc,
			Quantity:       l.qty,
			UnitPriceMinor: l.price,
			AmountMinor:    l.amt,
		})
		if iErr != nil {
			return DebitNoteDetail{}, iErr
		}
		saved = append(saved, rec)
	}

	if status == "issued" {
		if err := s.postDebitNoteLedger(ctx, qtx, workspaceID, dn); err != nil {
			return DebitNoteDetail{}, err
		}
	}
	_ = s.recordDocumentVersion(ctx, qtx, workspaceID, userID, "debit_note", dn.ID, "Created debit note "+dn.Status, ginMap("debit_note", dn, "items", saved))

	if err := tx.Commit(ctx); err != nil {
		return DebitNoteDetail{}, err
	}
	return DebitNoteDetail{DebitNote: dn, Items: saved}, nil
}

func (s *Service) postDebitNoteLedger(ctx context.Context, qtx *db.Queries, workspaceID int64, dn db.DebitNote) error {
	if dn.TotalAmountMinor <= 0 {
		return nil
	}
	entry, err := qtx.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      workspaceID,
		SourceType:       "adjustment",
		SourceID:         dn.ID,
		EntryDate:        dn.IssueDate,
		Currency:         dn.Currency,
		CurrencyExponent: int32(dn.CurrencyExponent),
		Description:      pgtype.Text{String: "Debit Note #" + dn.DebitNoteNumber, Valid: true},
	})
	if err != nil {
		return err
	}
	if _, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
		LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "asset",
		DebitMinor: dn.TotalAmountMinor, Description: pgtype.Text{String: "Accounts Receivable Adjustment: " + dn.CustomerName, Valid: true},
	}); err != nil {
		return err
	}
	if dn.SubtotalMinor > 0 {
		if _, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "revenue",
			CreditMinor: dn.SubtotalMinor, Description: pgtype.Text{String: "Adjustment Revenue", Valid: true},
		}); err != nil {
			return err
		}
	}
	if dn.TaxAmountMinor > 0 {
		if _, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "liability",
			CreditMinor: dn.TaxAmountMinor, Description: pgtype.Text{String: "Output VAT Adjustment", Valid: true},
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) VoidDebitNote(ctx context.Context, workspaceID, userID, dnID int64, reason string) (db.DebitNote, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return db.DebitNote{}, errors.New("void reason is required")
	}
	orig, err := s.queries.GetDebitNoteByID(ctx, db.GetDebitNoteByIDParams{ID: dnID, WorkspaceID: workspaceID})
	if err != nil {
		return db.DebitNote{}, ErrNotFound
	}
	if orig.Status == "voided" {
		return db.DebitNote{}, errors.New("debit note is already voided")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.DebitNote{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	voided, err := qtx.VoidDebitNote(ctx, db.VoidDebitNoteParams{
		ID: orig.ID, WorkspaceID: workspaceID, VoidReason: pgtype.Text{String: reason, Valid: true},
	})
	if err != nil {
		return db.DebitNote{}, err
	}
	if orig.Status == "issued" && orig.TotalAmountMinor > 0 {
		entry, eErr := qtx.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
			WorkspaceID: workspaceID, SourceType: "reversal", SourceID: orig.ID,
			EntryDate: pgtype.Date{Time: time.Now().UTC(), Valid: true},
			Currency:  orig.Currency, CurrencyExponent: int32(orig.CurrencyExponent),
			Description: pgtype.Text{String: "Void Debit Note #" + orig.DebitNoteNumber, Valid: true},
		})
		if eErr != nil {
			return db.DebitNote{}, eErr
		}
		if _, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "asset",
			CreditMinor: orig.TotalAmountMinor, Description: pgtype.Text{String: "Reverse AR Adjustment", Valid: true},
		}); err != nil {
			return db.DebitNote{}, err
		}
		if orig.SubtotalMinor > 0 {
			if _, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
				LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "revenue",
				DebitMinor: orig.SubtotalMinor, Description: pgtype.Text{String: "Reverse Adjustment Revenue", Valid: true},
			}); err != nil {
				return db.DebitNote{}, err
			}
		}
		if orig.TaxAmountMinor > 0 {
			if _, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
				LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "liability",
				DebitMinor: orig.TaxAmountMinor, Description: pgtype.Text{String: "Reverse Output VAT Adjustment", Valid: true},
			}); err != nil {
				return db.DebitNote{}, err
			}
		}
	}
	_ = s.recordDocumentVersion(ctx, qtx, workspaceID, userID, "debit_note", voided.ID, "Voided debit note: "+reason, voided)
	if err := tx.Commit(ctx); err != nil {
		return db.DebitNote{}, err
	}
	return voided, nil
}

// ---------------- External Portal Actions (Blueprint 05) ----------------

type SubmitPaymentEvidenceInput struct {
	PayerName     string `json:"payer_name" binding:"required"`
	PayerEmail    string `json:"payer_email"`
	Amount        string `json:"amount"`
	AmountMinor   int64  `json:"amount_minor"`
	PaymentDate   string `json:"payment_date" binding:"required"`
	PaymentMethod string `json:"payment_method" binding:"required"`
	Reference     string `json:"reference"`
	Notes         string `json:"notes"`
}

func (s *Service) SubmitPublicPaymentEvidence(ctx context.Context, token string, in SubmitPaymentEvidenceInput) (db.ExternalPaymentEvidence, error) {
	sum := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(sum[:])

	share, err := s.queries.GetInvoiceShareByHash(ctx, tokenHash)
	if err != nil {
		return db.ExternalPaymentEvidence{}, ErrNotFound
	}
	inv, err := s.queries.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{ID: share.InvoiceID, WorkspaceID: share.WorkspaceID})
	if err != nil {
		return db.ExternalPaymentEvidence{}, ErrNotFound
	}
	amt := in.AmountMinor
	if amt <= 0 && in.Amount != "" {
		parsed, pErr := ParseMajorToMinor(in.Amount, int(inv.CurrencyExponent))
		if pErr != nil {
			return db.ExternalPaymentEvidence{}, pErr
		}
		amt = parsed
	}
	if amt <= 0 {
		return db.ExternalPaymentEvidence{}, ErrNegativeAmount
	}
	payDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.PaymentDate))
	if err != nil {
		return db.ExternalPaymentEvidence{}, errors.New("invalid payment_date (expected YYYY-MM-DD)")
	}
	ev, err := s.queries.CreateExternalPaymentEvidence(ctx, db.CreateExternalPaymentEvidenceParams{
		WorkspaceID:   share.WorkspaceID,
		DocumentType:  "invoice",
		DocumentID:    share.InvoiceID,
		ShareID:       pgtype.Int8{Int64: share.ID, Valid: true},
		PayerName:     strings.TrimSpace(in.PayerName),
		PayerEmail:    optionalPgText(in.PayerEmail),
		AmountMinor:   amt,
		PaymentDate:   pgtype.Date{Time: payDate, Valid: true},
		PaymentMethod: strings.TrimSpace(in.PaymentMethod),
		Reference:     optionalPgText(in.Reference),
		Notes:         optionalPgText(in.Notes),
	})
	if err != nil {
		return db.ExternalPaymentEvidence{}, err
	}
	// Notify workspace owner about uploaded payment evidence
	if profile, pErr := s.queries.GetWorkspaceProfile(ctx, share.WorkspaceID); pErr == nil {
		_, _ = s.queries.CreateNotification(ctx, db.CreateNotificationParams{
			WorkspaceID: pgtype.Int8{Int64: share.WorkspaceID, Valid: true},
			UserID:      profile.OwnerUserID,
			Category:    "invoice",
			Title:       "Payment evidence submitted for " + inv.InvoiceNumber,
			Body:        fmt.Sprintf("%s uploaded proof of payment via portal.", ev.PayerName),
			ActionUrl:   pgtype.Text{String: "/invoices", Valid: true},
		})
	}
	return ev, nil
}

type PostExternalMessageInput struct {
	SenderName  string `json:"sender_name" binding:"required"`
	SenderEmail string `json:"sender_email"`
	Message     string `json:"message" binding:"required"`
}

func (s *Service) PostPublicMessage(ctx context.Context, docType, token string, in PostExternalMessageInput) (db.ExternalMessage, error) {
	msgText := strings.TrimSpace(in.Message)
	senderName := strings.TrimSpace(in.SenderName)
	if msgText == "" || senderName == "" {
		return db.ExternalMessage{}, errors.New("sender_name and message are required")
	}
	sum := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(sum[:])

	var wsID, docID int64
	var shareID pgtype.Int8

	switch docType {
	case "invoice":
		sh, err := s.queries.GetInvoiceShareByHash(ctx, tokenHash)
		if err != nil {
			return db.ExternalMessage{}, ErrNotFound
		}
		wsID, docID, shareID = sh.WorkspaceID, sh.InvoiceID, pgtype.Int8{Int64: sh.ID, Valid: true}
	case "estimate":
		sh, err := s.queries.GetEstimateShareByHash(ctx, tokenHash)
		if err != nil {
			return db.ExternalMessage{}, ErrNotFound
		}
		wsID, docID, shareID = sh.WorkspaceID, sh.EstimateID, pgtype.Int8{Int64: sh.ID, Valid: true}
	case "statement":
		sh, err := s.queries.GetCustomerStatementShareByHash(ctx, tokenHash)
		if err != nil {
			return db.ExternalMessage{}, ErrNotFound
		}
		wsID, docID, shareID = sh.WorkspaceID, sh.CustomerID, pgtype.Int8{Int64: sh.ID, Valid: true}
	case "purchase_order":
		var pID, pWsID int64
		err := s.pool.QueryRow(ctx, "SELECT id, workspace_id, purchase_order_id FROM purchase_order_shares WHERE token_hash=$1 AND status<>'revoked' AND expires_at>now()", tokenHash).Scan(&pID, &wsID, &docID)
		_ = pWsID
		if err != nil {
			return db.ExternalMessage{}, ErrNotFound
		}
		shareID = pgtype.Int8{Int64: pID, Valid: true}
	default:
		return db.ExternalMessage{}, errors.New("unsupported document_type")
	}

	msg, err := s.queries.CreateExternalMessage(ctx, db.CreateExternalMessageParams{
		WorkspaceID:  wsID,
		DocumentType: docType,
		DocumentID:   docID,
		ShareID:      shareID,
		SenderType:   "guest",
		SenderName:   senderName,
		SenderEmail:  optionalPgText(in.SenderEmail),
		Message:      msgText,
	})
	if err != nil {
		return db.ExternalMessage{}, err
	}

	actionURL := "/invoices"
	cat := "invoice"
	docLabel := fmt.Sprintf("%s #%d", strings.ReplaceAll(docType, "_", " "), docID)
	if docType == "purchase_order" {
		actionURL = fmt.Sprintf("/purchase-orders/%d", docID)
		cat = "inventory"
		docLabel = fmt.Sprintf("PO #%d", docID)
	}
	s.notifyWorkspaceUsers(ctx, wsID, cat, docType, docID, fmt.Sprintf("New message on %s", docLabel), fmt.Sprintf("%s: %s", senderName, msgText), actionURL)
	return msg, nil
}

func (s *Service) notifyWorkspaceUsers(ctx context.Context, wsID int64, category, resourceType string, resourceID int64, title, body, actionURL string) {
	seen := map[int64]bool{}
	var ownerID int64
	if err := s.pool.QueryRow(ctx, `SELECT owner_user_id FROM workspaces WHERE id = $1`, wsID).Scan(&ownerID); err == nil && ownerID > 0 {
		seen[ownerID] = true
	}
	rows, err := s.pool.Query(ctx, `SELECT user_id FROM memberships WHERE workspace_id = $1 AND status = 'active'`, wsID)
	if err == nil {
		for rows.Next() {
			var uid int64
			if rows.Scan(&uid) == nil && uid > 0 {
				seen[uid] = true
			}
		}
		rows.Close()
	}

	for uid := range seen {
		_, _ = s.queries.CreateNotification(ctx, db.CreateNotificationParams{
			WorkspaceID: pgtype.Int8{Int64: wsID, Valid: true},
			UserID:      uid,
			Category:    category,
			Title:       title,
			Body:        body,
			ActionUrl:   pgtype.Text{String: actionURL, Valid: actionURL != ""},
		})
		_ = s.queries.InsertProjectedNotification(ctx, db.InsertProjectedNotificationParams{
			WorkspaceID:     pgtype.Int8{Int64: wsID, Valid: true},
			UserID:          uid,
			Category:        category,
			TemplateKey:     "portal_update",
			TemplateVersion: "v1",
			Severity:        "info",
			ResourceType:    resourceType,
			ResourceID:      resourceID,
			ActionKey:       "view",
			ActionUrl:       pgtype.Text{String: actionURL, Valid: actionURL != ""},
			Title:           title,
			Body:            body,
			DedupeKey:       pgtype.Text{String: fmt.Sprintf("%s-%d-%d-%d", resourceType, resourceID, uid, time.Now().UnixNano()), Valid: true},
			Metadata:        []byte("{}"),
		})
	}
}

func (s *Service) ListPublicMessages(ctx context.Context, docType, token string) ([]db.ExternalMessage, error) {
	sum := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(sum[:])

	var wsID, docID int64
	switch docType {
	case "invoice":
		sh, err := s.queries.GetInvoiceShareByHash(ctx, tokenHash)
		if err != nil {
			return nil, ErrNotFound
		}
		wsID, docID = sh.WorkspaceID, sh.InvoiceID
	case "estimate":
		sh, err := s.queries.GetEstimateShareByHash(ctx, tokenHash)
		if err != nil {
			return nil, ErrNotFound
		}
		wsID, docID = sh.WorkspaceID, sh.EstimateID
	case "statement":
		sh, err := s.queries.GetCustomerStatementShareByHash(ctx, tokenHash)
		if err != nil {
			return nil, ErrNotFound
		}
		wsID, docID = sh.WorkspaceID, sh.CustomerID
	case "purchase_order":
		err := s.pool.QueryRow(ctx, "SELECT workspace_id, purchase_order_id FROM purchase_order_shares WHERE token_hash=$1 AND status<>'revoked' AND expires_at>now()", tokenHash).Scan(&wsID, &docID)
		if err != nil {
			return nil, ErrNotFound
		}
	default:
		return nil, errors.New("unsupported document_type")
	}
	return s.queries.ListExternalMessagesForDoc(ctx, db.ListExternalMessagesForDocParams{
		WorkspaceID:  wsID,
		DocumentType: docType,
		DocumentID:   docID,
	})
}

func (s *Service) ClaimExternalPartyLink(ctx context.Context, userID int64, docType, token string) (db.ExternalPartyLink, error) {
	sum := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(sum[:])

	var wsID, cpID, docID int64
	switch docType {
	case "invoice":
		sh, err := s.queries.GetInvoiceShareByHash(ctx, tokenHash)
		if err != nil {
			return db.ExternalPartyLink{}, ErrNotFound
		}
		inv, err := s.queries.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{ID: sh.InvoiceID, WorkspaceID: sh.WorkspaceID})
		if err != nil {
			return db.ExternalPartyLink{}, ErrNotFound
		}
		wsID, cpID, docID = sh.WorkspaceID, inv.CustomerID, inv.ID
	case "estimate":
		sh, err := s.queries.GetEstimateShareByHash(ctx, tokenHash)
		if err != nil {
			return db.ExternalPartyLink{}, ErrNotFound
		}
		est, err := s.queries.GetEstimateByID(ctx, db.GetEstimateByIDParams{ID: sh.EstimateID, WorkspaceID: sh.WorkspaceID})
		if err != nil || !est.CustomerID.Valid {
			return db.ExternalPartyLink{}, errors.New("estimate is not linked to a customer record")
		}
		wsID, cpID, docID = sh.WorkspaceID, est.CustomerID.Int64, est.ID
	case "statement":
		sh, err := s.queries.GetCustomerStatementShareByHash(ctx, tokenHash)
		if err != nil {
			return db.ExternalPartyLink{}, ErrNotFound
		}
		wsID, cpID, docID = sh.WorkspaceID, sh.CustomerID, sh.CustomerID
	case "purchase_order":
		err := s.pool.QueryRow(ctx, "SELECT workspace_id, purchase_order_id FROM purchase_order_shares WHERE token_hash=$1 AND status<>'revoked' AND expires_at>now()", tokenHash).Scan(&wsID, &docID)
		if err != nil {
			return db.ExternalPartyLink{}, ErrNotFound
		}
		po, poErr := s.queries.GetPurchaseOrderByID(ctx, db.GetPurchaseOrderByIDParams{WorkspaceID: wsID, ID: docID})
		if poErr != nil {
			return db.ExternalPartyLink{}, ErrNotFound
		}
		if po.SupplierID.Valid && po.SupplierID.Int64 > 0 {
			cpID = po.SupplierID.Int64
		} else {
			// Fallback to any active supplier in the workspace or create one for the claiming user
			_ = s.pool.QueryRow(ctx, `SELECT id FROM counterparties WHERE workspace_id=$1 AND party_type IN ('supplier','both') ORDER BY id ASC LIMIT 1`, wsID).Scan(&cpID)
			if cpID <= 0 {
				_ = s.pool.QueryRow(ctx, `INSERT INTO counterparties (workspace_id, name, party_type, is_active) VALUES ($1, 'Linked Supplier', 'supplier', true) RETURNING id`, wsID).Scan(&cpID)
			}
		}
	default:
		return db.ExternalPartyLink{}, errors.New("unsupported document_type")
	}

	link, err := s.queries.UpsertExternalPartyLink(ctx, db.UpsertExternalPartyLinkParams{
		WorkspaceID:        wsID,
		CounterpartyID:     cpID,
		UserID:             userID,
		SourceDocumentType: docType,
		SourceDocumentID:   docID,
	})
	if err != nil {
		return db.ExternalPartyLink{}, err
	}

	actionURL := "/contacts"
	if docType == "purchase_order" {
		actionURL = fmt.Sprintf("/purchase-orders/%d", docID)
	}
	s.notifyWorkspaceUsers(ctx, wsID, "inventory", docType, docID, "Supplier linked their Rekordly account", fmt.Sprintf("Your supplier connected their Rekordly account via %s #%d.", strings.ReplaceAll(docType, "_", " "), docID), actionURL)
	return link, nil
}

func ginMap(pairs ...any) map[string]any {
	m := map[string]any{}
	for i := 0; i+1 < len(pairs); i += 2 {
		if k, ok := pairs[i].(string); ok {
			m[k] = pairs[i+1]
		}
	}
	return m
}

type AttachDocumentFileInput struct {
	EvidenceID     int64  `json:"evidence_id,omitempty"`
	AssetID        string `json:"asset_id,omitempty"`
	FileName       string `json:"file_name,omitempty"`
	MimeType       string `json:"mime_type,omitempty"`
	SizeBytes      int64  `json:"size_bytes,omitempty"`
	IdempotencyKey string `json:"idempotency_key,omitempty"`
}

func (s *Service) AttachDocumentFile(ctx context.Context, workspaceID, userID int64, docType string, docID int64, in AttachDocumentFileInput) (DocumentFileView, error) {
	if !isAllowedDocumentType(docType) {
		return DocumentFileView{}, errors.New("unsupported document type")
	}
	if docID <= 0 {
		return DocumentFileView{}, errors.New("invalid document ID")
	}
	if in.EvidenceID <= 0 && strings.TrimSpace(in.AssetID) == "" {
		return DocumentFileView{}, errors.New("Upload the file first")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DocumentFileView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	var docExists bool
	switch docType {
	case "purchase_order":
		docExists, err = q.CheckPurchaseOrderExists(ctx, db.CheckPurchaseOrderExistsParams{WorkspaceID: workspaceID, ID: docID})
	case "goods_receipt":
		docExists, err = q.CheckGoodsReceiptExists(ctx, db.CheckGoodsReceiptExistsParams{WorkspaceID: workspaceID, ID: docID})
	case "supplier_bill":
		docExists, err = q.CheckSupplierBillExists(ctx, db.CheckSupplierBillExistsParams{WorkspaceID: workspaceID, ID: docID})
	case "purchase":
		docExists, err = q.CheckPurchaseExists(ctx, db.CheckPurchaseExistsParams{WorkspaceID: workspaceID, ID: docID})
	case "invoice":
		docExists, err = q.CheckInvoiceExists(ctx, db.CheckInvoiceExistsParams{WorkspaceID: workspaceID, ID: docID})
	default:
		return DocumentFileView{}, errors.New("unsupported document type")
	}
	if err != nil {
		return DocumentFileView{}, err
	}
	if !docExists {
		return DocumentFileView{}, ErrNotFound
	}

	idempKey := strings.TrimSpace(in.IdempotencyKey)
	var keyDigest [32]byte
	operation := fmt.Sprintf("document_file:%s:%d", docType, docID)
	hasIdemp := idempKey != ""

	if hasIdemp {
		keyDigest = sha256.Sum256([]byte(idempKey))
		stored, err := q.GetIdempotencyRecordForUpdate(ctx, db.GetIdempotencyRecordForUpdateParams{
			ActorUserID: pgtype.Int8{Int64: userID, Valid: true},
			Operation:   operation,
			KeyDigest:   keyDigest[:],
		})
		if err == nil {
			if stored.Status == "completed" && stored.ResourceID.Valid && stored.ResourceID.String != "" {
				docFileID, parseErr := strconv.ParseInt(stored.ResourceID.String, 10, 64)
				if parseErr == nil {
					existingRow, getErr := q.GetDocumentFileByID(ctx, db.GetDocumentFileByIDParams{
						WorkspaceID: workspaceID,
						ID:          docFileID,
					})
					if getErr == nil {
						_ = tx.Commit(ctx)
						return DocumentFileView{
							ID:             existingRow.ID,
							EvidenceID:     existingRow.EvidenceID,
							FileName:       existingRow.FileName,
							MimeType:       existingRow.MimeType,
							SizeBytes:      existingRow.SizeBytes,
							CreatedAt:      existingRow.CreatedAt.Time,
							UploadedByName: existingRow.UploadedByName,
						}, nil
					}
				}
			}
			return DocumentFileView{}, errors.New("matching document file attachment is already processing")
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return DocumentFileView{}, err
		}

		requestDigest := sha256.Sum256([]byte(fmt.Sprintf("%d:%s:%d:%s:%d", workspaceID, docType, docID, in.AssetID, in.EvidenceID)))
		_, err = q.CreateIdempotencyRecord(ctx, db.CreateIdempotencyRecordParams{
			ActorUserID:   pgtype.Int8{Int64: userID, Valid: true},
			Operation:     operation,
			KeyDigest:     keyDigest[:],
			RequestDigest: requestDigest[:],
			ExpiresAt:     pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
		})
		if err != nil {
			return DocumentFileView{}, fmt.Errorf("reserve idempotency record: %w", err)
		}
	}

	var evidenceID int64
	var fileName string
	var mimeType string
	var sizeBytes int64

	if in.EvidenceID > 0 {
		// Existing asset in same workspace
		asset, err := q.GetEvidenceAssetByID(ctx, db.GetEvidenceAssetByIDParams{
			WorkspaceID: workspaceID,
			ID:          in.EvidenceID,
		})
		if err != nil {
			return DocumentFileView{}, fmt.Errorf("evidence asset not found in workspace: %w", ErrNotFound)
		}
		evidenceID = asset.ID
		fileName = asset.OriginalFileName
		mimeType = asset.MimeType
		sizeBytes = asset.ByteSize

		// If already linked to this document, return the existing link
		if existingLink, err := q.GetDocumentFileByEvidence(ctx, db.GetDocumentFileByEvidenceParams{
			WorkspaceID:     workspaceID,
			DocumentType:    docType,
			DocumentID:      docID,
			EvidenceAssetID: evidenceID,
		}); err == nil {
			if hasIdemp {
				_ = q.CompleteIdempotencyRecord(ctx, db.CompleteIdempotencyRecordParams{
					ActorUserID:  pgtype.Int8{Int64: userID, Valid: true},
					Operation:    operation,
					KeyDigest:    keyDigest[:],
					ResourceType: pgtype.Text{String: "document_file", Valid: true},
					ResourceID:   pgtype.Text{String: strconv.FormatInt(existingLink.ID, 10), Valid: true},
				})
			}
			_ = tx.Commit(ctx)
			return DocumentFileView{
				ID:             existingLink.ID,
				EvidenceID:     existingLink.EvidenceID,
				FileName:       existingLink.FileName,
				MimeType:       existingLink.MimeType,
				SizeBytes:      existingLink.SizeBytes,
				CreatedAt:      existingLink.CreatedAt.Time,
				UploadedByName: existingLink.UploadedByName,
			}, nil
		}
	} else {
		assetID := strings.TrimSpace(in.AssetID)
		existingAsset, err := q.GetEvidenceAssetByStorageAndAssetID(ctx, db.GetEvidenceAssetByStorageAndAssetIDParams{
			StorageProvider: "cloudinary",
			AssetID:         assetID,
		})
		if err == nil {
			if existingAsset.WorkspaceID != workspaceID {
				return DocumentFileView{}, fmt.Errorf("evidence asset belongs to another workspace: %w", ErrNotFound)
			}
			evidenceID = existingAsset.ID
			fileName = existingAsset.OriginalFileName
			mimeType = existingAsset.MimeType
			sizeBytes = existingAsset.ByteSize

			// If already linked to this document, return existing link
			if existingLink, err := q.GetDocumentFileByEvidence(ctx, db.GetDocumentFileByEvidenceParams{
				WorkspaceID:     workspaceID,
				DocumentType:    docType,
				DocumentID:      docID,
				EvidenceAssetID: evidenceID,
			}); err == nil {
				if hasIdemp {
					_ = q.CompleteIdempotencyRecord(ctx, db.CompleteIdempotencyRecordParams{
						ActorUserID:  pgtype.Int8{Int64: userID, Valid: true},
						Operation:    operation,
						KeyDigest:    keyDigest[:],
						ResourceType: pgtype.Text{String: "document_file", Valid: true},
						ResourceID:   pgtype.Text{String: strconv.FormatInt(existingLink.ID, 10), Valid: true},
					})
				}
				_ = tx.Commit(ctx)
				return DocumentFileView{
					ID:             existingLink.ID,
					EvidenceID:     existingLink.EvidenceID,
					FileName:       existingLink.FileName,
					MimeType:       existingLink.MimeType,
					SizeBytes:      existingLink.SizeBytes,
					CreatedAt:      existingLink.CreatedAt.Time,
					UploadedByName: existingLink.UploadedByName,
				}, nil
			}
		} else if errors.Is(err, pgx.ErrNoRows) {
			if err := validateEvidenceIntent(in.FileName, in.MimeType, in.SizeBytes); err != nil {
				return DocumentFileView{}, err
			}
			if s.evidenceUploader != nil {
				verified, err := s.evidenceUploader.Verify(ctx, assetID)
				if err != nil {
					return DocumentFileView{}, err
				}
				if verified.Bytes != in.SizeBytes || verified.MimeType != strings.ToLower(strings.TrimSpace(in.MimeType)) {
					return DocumentFileView{}, ErrEvidenceAsset
				}
			}

			asset, err := q.CreateDocumentEvidenceAsset(ctx, db.CreateDocumentEvidenceAssetParams{
				WorkspaceID:      workspaceID,
				UploadedByUserID: pgtype.Int8{Int64: userID, Valid: true},
				StorageProvider:  "cloudinary",
				AssetID:          assetID,
				DeliveryType:     "authenticated",
				OriginalFileName: filepath.Base(in.FileName),
				ByteSize:         in.SizeBytes,
				MimeType:         strings.ToLower(strings.TrimSpace(in.MimeType)),
				Sha256Hash:       pgtype.Text{},
				Status:           "verified",
			})
			if err != nil {
				return DocumentFileView{}, fmt.Errorf("create document evidence asset: %w", err)
			}
			evidenceID = asset.ID
			fileName = asset.OriginalFileName
			mimeType = asset.MimeType
			sizeBytes = asset.ByteSize
		} else {
			return DocumentFileView{}, err
		}
	}

	insertedRow, err := q.InsertDocumentFile(ctx, db.InsertDocumentFileParams{
		WorkspaceID:     workspaceID,
		DocumentType:    docType,
		DocumentID:      docID,
		EvidenceAssetID: evidenceID,
		CreatedByUserID: userID,
	})
	var docFileID int64
	var createdAt time.Time
	var uploadedByName string = "You"

	if errors.Is(err, pgx.ErrNoRows) {
		existingLink, err := q.GetDocumentFileByEvidence(ctx, db.GetDocumentFileByEvidenceParams{
			WorkspaceID:     workspaceID,
			DocumentType:    docType,
			DocumentID:      docID,
			EvidenceAssetID: evidenceID,
		})
		if err != nil {
			return DocumentFileView{}, fmt.Errorf("read existing document file: %w", err)
		}
		docFileID = existingLink.ID
		evidenceID = existingLink.EvidenceID
		fileName = existingLink.FileName
		mimeType = existingLink.MimeType
		sizeBytes = existingLink.SizeBytes
		createdAt = existingLink.CreatedAt.Time
		uploadedByName = existingLink.UploadedByName
	} else if err != nil {
		return DocumentFileView{}, fmt.Errorf("insert document file: %w", err)
	} else {
		docFileID = insertedRow.ID
		createdAt = insertedRow.CreatedAt.Time
	}

	if hasIdemp {
		err = q.CompleteIdempotencyRecord(ctx, db.CompleteIdempotencyRecordParams{
			ActorUserID:  pgtype.Int8{Int64: userID, Valid: true},
			Operation:    operation,
			KeyDigest:    keyDigest[:],
			ResourceType: pgtype.Text{String: "document_file", Valid: true},
			ResourceID:   pgtype.Text{String: strconv.FormatInt(docFileID, 10), Valid: true},
		})
		if err != nil {
			return DocumentFileView{}, fmt.Errorf("complete idempotency record: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return DocumentFileView{}, fmt.Errorf("commit attach document file: %w", err)
	}

	return DocumentFileView{
		ID:             docFileID,
		EvidenceID:     evidenceID,
		FileName:       fileName,
		MimeType:       mimeType,
		SizeBytes:      sizeBytes,
		CreatedAt:      createdAt,
		UploadedByName: uploadedByName,
	}, nil
}
