package finance

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/crypto"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/notify"
	"github.com/rekordly/rekordly-api/internal/payments"
	"github.com/shopspring/decimal"
)

var (
	ErrProviderNotAvailable    = errors.New("payment provider is not configured or available")
	ErrInvalidWebhookSignature = errors.New("invalid webhook signature")
	ErrPaymentAttemptNotFound  = errors.New("payment attempt not found")
	ErrPaymentAmountMismatch   = errors.New("payment amount does not match expected attempt")
)

type MerchantPayoutAccountView struct {
	ID                 int64  `json:"id"`
	Provider           string `json:"provider"`
	BankCode           string `json:"bank_code"`
	AccountNumberLast4 string `json:"account_number_last4"`
	AccountName        string `json:"account_name"`
	Status             string `json:"status"`
}

type StorefrontPaymentSettingsView struct {
	PayoutAccount                *MerchantPayoutAccountView `json:"payout_account"`
	AvailableProviders           []string                   `json:"available_providers"`
	PaymentBankTransferEnabled   bool                       `json:"payment_bank_transfer_enabled"`
	PaymentCardEnabled           bool                       `json:"payment_card_enabled"`
	PaymentManualTransferEnabled bool                       `json:"payment_manual_transfer_enabled"`
	PaymentCodEnabled            bool                       `json:"payment_cod_enabled"`
	FeeBearer                    string                     `json:"fee_bearer"`
	HoldPaymentMinutes           int32                      `json:"hold_payment_minutes"`
	HoldManualTransferHours      int32                      `json:"hold_manual_transfer_hours"`
	HoldConfirmationHours        int32                      `json:"hold_confirmation_hours"`
	HoldPickupHours              int32                      `json:"hold_pickup_hours"`
	CommissionPercent            float64                    `json:"commission_percent"`
	ManualBankName               *string                    `json:"manual_bank_name,omitempty"`
	ManualBankAccountNumber      *string                    `json:"manual_bank_account_number,omitempty"`
	ManualBankAccountName        *string                    `json:"manual_bank_account_name,omitempty"`
}

type UpdateStorefrontPaymentSettingsInput struct {
	PaymentBankTransferEnabled   *bool   `json:"payment_bank_transfer_enabled"`
	PaymentCardEnabled           *bool   `json:"payment_card_enabled"`
	PaymentManualTransferEnabled *bool   `json:"payment_manual_transfer_enabled"`
	PaymentCodEnabled            *bool   `json:"payment_cod_enabled"`
	FeeBearer                    *string `json:"fee_bearer"`
	HoldPaymentMinutes           *int32  `json:"hold_payment_minutes"`
	HoldManualTransferHours      *int32  `json:"hold_manual_transfer_hours"`
	HoldConfirmationHours        *int32  `json:"hold_confirmation_hours"`
	HoldPickupHours              *int32  `json:"hold_pickup_hours"`
	ManualBankName               *string `json:"manual_bank_name"`
	ManualBankAccountNumber      *string `json:"manual_bank_account_number"`
	ManualBankAccountName        *string `json:"manual_bank_account_name"`
}

type SavePayoutAccountInput struct {
	Provider      string `json:"provider"`
	BankCode      string `json:"bank_code"`
	AccountNumber string `json:"account_number"`
	AccountName   string `json:"account_name"`
}

type RecordPayoutInput struct {
	Provider         string `json:"provider"`
	DestinationAccID int64  `json:"destination_account_id"`
	AmountMinor      int64  `json:"amount_minor"`
	Reference        string `json:"reference"`
	Notes            string `json:"notes"`
	IdempotencyKey   string `json:"idempotency_key"`
}

func (s *Service) getPaymentProvider(key string) (payments.Provider, error) {
	key = strings.ToLower(strings.TrimSpace(key))
	if key == "" {
		key = "paystack"
	}
	if s.storefrontPaymentProviders == nil {
		return nil, ErrProviderNotAvailable
	}
	p, ok := s.storefrontPaymentProviders[key]
	if !ok || p == nil {
		return nil, ErrProviderNotAvailable
	}
	return p, nil
}

func (s *Service) ListPaymentBanks(ctx context.Context, providerKey string) ([]payments.Bank, error) {
	p, err := s.getPaymentProvider(providerKey)
	if err != nil {
		return nil, err
	}
	return p.ListBanks(ctx)
}

func (s *Service) ResolveBankAccount(ctx context.Context, providerKey, bankCode, accountNumber string) (string, error) {
	p, err := s.getPaymentProvider(providerKey)
	if err != nil {
		return "", err
	}
	return p.ResolveBankAccount(ctx, strings.TrimSpace(bankCode), strings.TrimSpace(accountNumber))
}

func (s *Service) SavePayoutAccount(ctx context.Context, wsID int64, in SavePayoutAccountInput) (MerchantPayoutAccountView, error) {
	providerKey := strings.ToLower(strings.TrimSpace(in.Provider))
	if providerKey == "" {
		providerKey = "paystack"
	}
	p, err := s.getPaymentProvider(providerKey)
	if err != nil {
		return MerchantPayoutAccountView{}, err
	}
	accountNumber := strings.TrimSpace(in.AccountNumber)
	bankCode := strings.TrimSpace(in.BankCode)
	accountName := strings.TrimSpace(in.AccountName)
	if len(accountNumber) < 10 {
		return MerchantPayoutAccountView{}, errors.New("account number must be at least 10 digits")
	}
	if bankCode == "" {
		return MerchantPayoutAccountView{}, errors.New("bank code is required")
	}
	if accountName == "" {
		resolved, rErr := p.ResolveBankAccount(ctx, bankCode, accountNumber)
		if rErr != nil {
			return MerchantPayoutAccountView{}, fmt.Errorf("resolve account: %w", rErr)
		}
		accountName = resolved
	}

	// Create subaccount on provider
	subRef, err := p.CreateSubaccount(ctx, payments.MerchantPayoutAccount{
		BankCode:      bankCode,
		AccountNumber: accountNumber,
		AccountName:   accountName,
	})
	if err != nil {
		return MerchantPayoutAccountView{}, fmt.Errorf("create provider subaccount: %w", err)
	}

	// Encrypt subaccount_ref at rest
	encRef, err := crypto.Encrypt(subRef.Code)
	if err != nil {
		return MerchantPayoutAccountView{}, fmt.Errorf("encrypt subaccount ref: %w", err)
	}

	last4 := accountNumber
	if len(last4) > 4 {
		last4 = last4[len(last4)-4:]
	}

	row, err := s.queries.UpsertMerchantPayoutAccount(ctx, db.UpsertMerchantPayoutAccountParams{
		WorkspaceID:        wsID,
		Provider:           providerKey,
		BankCode:           bankCode,
		AccountNumberLast4: last4,
		AccountName:        accountName,
		SubaccountRef:      encRef,
		Status:             "active",
	})
	if err != nil {
		return MerchantPayoutAccountView{}, err
	}

	return MerchantPayoutAccountView{
		ID:                 row.ID,
		Provider:           row.Provider,
		BankCode:           row.BankCode,
		AccountNumberLast4: row.AccountNumberLast4,
		AccountName:        row.AccountName,
		Status:             row.Status,
	}, nil
}

func (s *Service) GetStorefrontPaymentSettings(ctx context.Context, wsID int64) (StorefrontPaymentSettingsView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, wsID)
	if err != nil {
		return StorefrontPaymentSettingsView{}, err
	}
	settings, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{
		StorefrontID: sf.ID,
		WorkspaceID:  wsID,
	})
	if err != nil {
		return StorefrontPaymentSettingsView{}, err
	}

	var payoutView *MerchantPayoutAccountView
	if accounts, lErr := s.queries.ListMerchantPayoutAccounts(ctx, wsID); lErr == nil && len(accounts) > 0 {
		chosen := accounts[0]
		for _, a := range accounts {
			if a.Status == "active" {
				chosen = a
				if _, ok := s.storefrontPaymentProviders[a.Provider]; ok {
					break
				}
			}
		}
		payoutView = &MerchantPayoutAccountView{
			ID:                 chosen.ID,
			Provider:           chosen.Provider,
			BankCode:           chosen.BankCode,
			AccountNumberLast4: chosen.AccountNumberLast4,
			AccountName:        chosen.AccountName,
			Status:             chosen.Status,
		}
	}

	avail := make([]string, 0, len(s.storefrontPaymentProviders))
	for k := range s.storefrontPaymentProviders {
		avail = append(avail, k)
	}
	if len(avail) == 0 {
		avail = append(avail, "paystack")
	}

	return StorefrontPaymentSettingsView{
		PayoutAccount:                payoutView,
		AvailableProviders:           avail,
		PaymentBankTransferEnabled:   settings.PaymentBankTransferEnabled,
		PaymentCardEnabled:           settings.PaymentCardEnabled,
		PaymentManualTransferEnabled: settings.PaymentManualTransferEnabled,
		PaymentCodEnabled:            settings.PaymentCodEnabled,
		FeeBearer:                    settings.FeeBearer,
		HoldPaymentMinutes:           settings.HoldPaymentMinutes,
		HoldManualTransferHours:      settings.HoldManualTransferHours,
		HoldConfirmationHours:        settings.HoldConfirmationHours,
		HoldPickupHours:              settings.HoldPickupHours,
		CommissionPercent:            s.platformCommissionPercent,
		ManualBankName:               nullableText(settings.ManualBankName),
		ManualBankAccountNumber:      nullableText(settings.ManualBankAccountNumber),
		ManualBankAccountName:        nullableText(settings.ManualBankAccountName),
	}, nil
}

func (s *Service) UpdateStorefrontPaymentSettings(ctx context.Context, wsID int64, in UpdateStorefrontPaymentSettingsInput) (StorefrontPaymentSettingsView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, wsID)
	if err != nil {
		return StorefrontPaymentSettingsView{}, err
	}
	settings, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{
		StorefrontID: sf.ID,
		WorkspaceID:  wsID,
	})
	if err != nil {
		return StorefrontPaymentSettingsView{}, err
	}

	bankTransfer := settings.PaymentBankTransferEnabled
	if in.PaymentBankTransferEnabled != nil {
		bankTransfer = *in.PaymentBankTransferEnabled
	}
	card := settings.PaymentCardEnabled
	if in.PaymentCardEnabled != nil {
		card = *in.PaymentCardEnabled
	}
	manual := settings.PaymentManualTransferEnabled
	if in.PaymentManualTransferEnabled != nil {
		manual = *in.PaymentManualTransferEnabled
	}
	cod := settings.PaymentCodEnabled
	if in.PaymentCodEnabled != nil {
		cod = *in.PaymentCodEnabled
	}
	bearer := settings.FeeBearer
	if in.FeeBearer != nil {
		b := strings.ToLower(strings.TrimSpace(*in.FeeBearer))
		if b == "merchant" || b == "customer" {
			bearer = b
		}
	}
	holdPay := settings.HoldPaymentMinutes
	if in.HoldPaymentMinutes != nil && *in.HoldPaymentMinutes > 0 {
		holdPay = *in.HoldPaymentMinutes
	}
	holdManual := settings.HoldManualTransferHours
	if in.HoldManualTransferHours != nil && *in.HoldManualTransferHours > 0 {
		holdManual = *in.HoldManualTransferHours
	}
	holdConf := settings.HoldConfirmationHours
	if in.HoldConfirmationHours != nil && *in.HoldConfirmationHours > 0 {
		holdConf = *in.HoldConfirmationHours
	}
	holdPick := settings.HoldPickupHours
	if in.HoldPickupHours != nil && *in.HoldPickupHours > 0 {
		holdPick = *in.HoldPickupHours
	}

	_, err = s.queries.UpdateStorefrontPaymentSettings(ctx, db.UpdateStorefrontPaymentSettingsParams{
		WorkspaceID:                  wsID,
		StorefrontID:                 sf.ID,
		PaymentBankTransferEnabled:   bankTransfer,
		PaymentCardEnabled:           card,
		PaymentManualTransferEnabled: manual,
		PaymentCodEnabled:            cod,
		FeeBearer:                    bearer,
		HoldPaymentMinutes:           holdPay,
		HoldManualTransferHours:      holdManual,
		HoldConfirmationHours:        holdConf,
		HoldPickupHours:              holdPick,
	})
	if err != nil {
		return StorefrontPaymentSettingsView{}, err
	}

	if in.ManualBankName != nil || in.ManualBankAccountNumber != nil || in.ManualBankAccountName != nil {
		mBank := settings.ManualBankName
		if in.ManualBankName != nil {
			mBank = optionalPgText(sanitizePublicText(*in.ManualBankName, 120))
		}
		mAcctNo := settings.ManualBankAccountNumber
		if in.ManualBankAccountNumber != nil {
			mAcctNo = optionalPgText(sanitizePublicText(*in.ManualBankAccountNumber, 40))
		}
		mAcctName := settings.ManualBankAccountName
		if in.ManualBankAccountName != nil {
			mAcctName = optionalPgText(sanitizePublicText(*in.ManualBankAccountName, 160))
		}
		if _, mbErr := s.queries.UpdateStorefrontManualBankDetails(ctx, db.UpdateStorefrontManualBankDetailsParams{
			WorkspaceID:             wsID,
			StorefrontID:            sf.ID,
			ManualBankName:          mBank,
			ManualBankAccountNumber: mAcctNo,
			ManualBankAccountName:   mAcctName,
		}); mbErr != nil {
			return StorefrontPaymentSettingsView{}, mbErr
		}
	}

	invalidateStorefrontCache(sf.Slug)
	return s.GetStorefrontPaymentSettings(ctx, wsID)
}

func (s *Service) HandlePaymentWebhook(ctx context.Context, providerKey string, rawBody []byte, headers http.Header) error {
	p, err := s.getPaymentProvider(providerKey)
	if err != nil {
		return err
	}
	event, err := p.VerifyWebhook(rawBody, headers)
	if err != nil {
		return ErrInvalidWebhookSignature
	}

	// Idempotent webhook tracking
	recorded, err := s.queries.InsertPaymentWebhookEvent(ctx, db.InsertPaymentWebhookEventParams{
		Provider: providerKey,
		EventID:  event.Reference,
		Outcome:  "processed",
	})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && recorded.ID == 0) {
		return nil // already processed, idempotent 200
	}
	if err != nil {
		return err
	}

	attempt, err := s.queries.GetStorefrontPaymentAttemptByReference(ctx, event.Reference)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // unknown attempt, accept and ignore
		}
		return err
	}

	if event.Status == "failed" {
		_, _ = s.queries.UpdatePaymentAttemptStatus(ctx, db.UpdatePaymentAttemptStatusParams{
			ID:       attempt.ID,
			Status:   "rejected",
			RawEvent: event.Raw,
		})
		return nil
	}

	if event.Status == "paid" {
		if event.AmountMinor != attempt.AmountMinor {
			return ErrPaymentAmountMismatch
		}
		attempt.FeeMinor = event.FeeMinor
		attempt.RawEvent = event.Raw
		return s.MarkStorefrontOrderPaid(ctx, attempt)
	}

	return nil
}

// MarkStorefrontOrderPaid runs in one atomic transaction:
// 1. Marks the attempt paid and the order paid
// 2. Turns the hold firm
// 3. Creates or links the Sale with source = online_store
// 4. Posts balanced ledger entries (Clearing, Fees, Revenue, Tax)
// 5. Writes order event and sends customer email
func (s *Service) MarkStorefrontOrderPaid(ctx context.Context, attempt db.StorefrontPaymentAttempt) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	order, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{
		WorkspaceID: attempt.WorkspaceID,
		ID:          attempt.OrderID,
	})
	if err != nil {
		return err
	}

	if order.PaymentStatus == "paid" && attempt.Status == "paid" {
		return nil // Idempotent replay
	}

	// Check late payment after expiry
	now := time.Now().UTC()
	isExpired := order.CommercialStatus == "cancelled" || (order.ReservationExpiresAt.Valid && order.ReservationExpiresAt.Time.Before(now))
	if isExpired {
		// Attempt to re-hold stock
		lines, lErr := q.ListStorefrontOrderLines(ctx, order.ID)
		if lErr != nil {
			return lErr
		}
		stockAvailable := true
		for _, l := range lines {
			if l.ProductKind != "stock_tracked" || l.ConfirmedQuantity.IsZero() {
				continue
			}
			bal, bErr := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
				WorkspaceID: attempt.WorkspaceID,
				LocationID:  order.OutletID.Int64,
				ProductID:   l.ProductID,
				VariantID:   l.VariantID,
			})
			if bErr != nil {
				stockAvailable = false
				break
			}
			avail := bal.QuantityOnHand.Sub(bal.ReservedQuantity)
			if avail.LessThan(l.ConfirmedQuantity) {
				stockAvailable = false
				break
			}
		}

		if !stockAvailable {
			// Do NOT oversell. Flag paid_needs_attention
			_, _ = q.UpdatePaymentAttemptStatus(ctx, db.UpdatePaymentAttemptStatusParams{
				ID:       attempt.ID,
				Status:   "paid",
				RawEvent: attempt.RawEvent,
			})
			_, _ = q.UpdateStorefrontOrderPaymentStatus(ctx, db.UpdateStorefrontOrderPaymentStatusParams{
				WorkspaceID:   attempt.WorkspaceID,
				ID:            order.ID,
				PaymentStatus: "paid_needs_attention",
				LinkedSaleID:  pgtype.Int8{Valid: false},
			})
			_, _ = q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
				WorkspaceID:     attempt.WorkspaceID,
				OrderID:         order.ID,
				EventType:       "payment_needs_attention",
				ActorType:       "system",
				CustomerVisible: true,
				Message:         optionalPgText("Late payment received after reservation expired, but stock is unavailable. Merchant attention required (refund or restock)."),
			})
			return tx.Commit(ctx)
		}

		// Re-reserve stock
		for _, l := range lines {
			if l.ProductKind != "stock_tracked" || l.ConfirmedQuantity.IsZero() {
				continue
			}
			bal, _ := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
				WorkspaceID: attempt.WorkspaceID,
				LocationID:  order.OutletID.Int64,
				ProductID:   l.ProductID,
				VariantID:   l.VariantID,
			})
			_, _ = q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
				WorkspaceID:       attempt.WorkspaceID,
				LocationID:        order.OutletID.Int64,
				ProductID:         l.ProductID,
				VariantID:         l.VariantID,
				QuantityOnHand:    bal.QuantityOnHand,
				ReservedQuantity:  bal.ReservedQuantity.Add(l.ConfirmedQuantity),
				InTransitQuantity: bal.InTransitQuantity,
				ValueOnHandMinor:  bal.ValueOnHandMinor,
			})
			res, _ := q.CreateStockReservation(ctx, db.CreateStockReservationParams{
				WorkspaceID:    attempt.WorkspaceID,
				LocationID:     order.OutletID.Int64,
				ProductID:      l.ProductID,
				VariantID:      l.VariantID,
				OrderID:        pgtype.Int8{Int64: order.ID, Valid: true},
				Quantity:       l.ConfirmedQuantity,
				Status:         "active",
				ExpiresAt:      pgtype.Timestamptz{Valid: false}, // firm hold
				Notes:          pgtype.Text{String: "Re-reserved for paid order " + order.OrderReference, Valid: true},
				IdempotencyKey: pgtype.Text{String: fmt.Sprintf("sf-order-%d-line-%d-rehold", order.ID, l.ID), Valid: true},
			})
			_, _ = q.UpdateStorefrontOrderLineReservation(ctx, db.UpdateStorefrontOrderLineReservationParams{
				ID:                l.ID,
				ReservationID:     pgtype.Int8{Int64: res.ID, Valid: true},
				ConfirmedQuantity: l.ConfirmedQuantity,
				UnitPriceMinor:    l.UnitPriceMinor,
				LineTotalMinor:    l.LineTotalMinor,
			})
		}
	}

	// 1. Mark attempt paid
	_, err = q.UpdatePaymentAttemptStatus(ctx, db.UpdatePaymentAttemptStatusParams{
		ID:       attempt.ID,
		Status:   "paid",
		RawEvent: attempt.RawEvent,
	})
	if err != nil {
		return err
	}

	// 2. Turn hold firm (expires_at = null)
	_, _ = tx.Exec(ctx, `
		UPDATE stock_reservations
		SET expires_at = NULL, updated_at = now()
		WHERE workspace_id = $1 AND order_id = $2 AND status = 'active'
	`, attempt.WorkspaceID, order.ID)

	// 3. Create or link Sale with source = 'online_store'
	var sale db.Sale
	existingSale, sErr := q.GetSaleByStorefrontOrder(ctx, db.GetSaleByStorefrontOrderParams{
		WorkspaceID:       attempt.WorkspaceID,
		StorefrontOrderID: pgtype.Int8{Int64: order.ID, Valid: true},
	})
	if sErr == nil {
		sale = existingSale
	} else if errors.Is(sErr, pgx.ErrNoRows) {
		saleDate := time.Now().UTC()
		if order.CreatedAt.Valid {
			saleDate = order.CreatedAt.Time.UTC()
		}
		newSale, err := q.CreateStorefrontOrderSale(ctx, db.CreateStorefrontOrderSaleParams{
			WorkspaceID:       attempt.WorkspaceID,
			CustomerID:        order.CustomerID,
			CustomerName:      order.CustomerName,
			SaleDate:          pgtype.Date{Time: saleDate, Valid: true},
			TotalAmountMinor:  order.TotalMinor,
			PaidAmountMinor:   order.TotalMinor,
			Currency:          order.Currency,
			CurrencyExponent:  order.CurrencyExponent,
			Notes:             pgtype.Text{String: "Paid online store order " + order.OrderReference, Valid: true},
			Reference:         pgtype.Text{String: order.OrderReference, Valid: true},
			IdempotencyKey:    pgtype.Text{String: fmt.Sprintf("online-store-order-%d", order.ID), Valid: true},
			CreatedByUserID:   pgtype.Int8{Valid: false},
			StorefrontOrderID: pgtype.Int8{Int64: order.ID, Valid: true},
		})
		if err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `UPDATE sales SET source = 'online_store' WHERE id = $1`, newSale.ID)
		sale = newSale

		lines, err := q.ListStorefrontOrderLines(ctx, order.ID)
		if err != nil {
			return err
		}
		for _, line := range lines {
			if line.ConfirmedQuantity.IsZero() {
				continue
			}
			if _, err := q.CreateStorefrontOrderSaleItem(ctx, db.CreateStorefrontOrderSaleItemParams{
				WorkspaceID:    attempt.WorkspaceID,
				SaleID:         sale.ID,
				ProductID:      pgtype.Int8{Int64: line.ProductID, Valid: line.ProductID > 0},
				VariantID:      line.VariantID,
				Description:    line.TitleSnapshot,
				Quantity:       line.ConfirmedQuantity,
				UnitPriceMinor: line.UnitPriceMinor,
				AmountMinor:    line.LineTotalMinor,
			}); err != nil {
				return err
			}
		}
	} else {
		return sErr
	}

	// 4. Posts the money:
	// Find or create Clearing money account
	clearingName := fmt.Sprintf("Payment provider clearing (%s)", strings.Title(attempt.Provider))
	var clearingAccID int64
	err = tx.QueryRow(ctx, `SELECT id FROM money_accounts WHERE workspace_id = $1 AND name = $2`, attempt.WorkspaceID, clearingName).Scan(&clearingAccID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `
			INSERT INTO money_accounts (workspace_id, name, account_type, currency)
			VALUES ($1, $2, 'clearing', $3)
			RETURNING id
		`, attempt.WorkspaceID, clearingName, order.Currency).Scan(&clearingAccID)
	}
	if err != nil {
		return fmt.Errorf("clearing money account: %w", err)
	}

	// Ledger Entry
	ledgerEntry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      attempt.WorkspaceID,
		SourceType:       "sale",
		SourceID:         sale.ID,
		EntryDate:        pgtype.Date{Time: time.Now().UTC(), Valid: true},
		Currency:         order.Currency,
		CurrencyExponent: order.CurrencyExponent,
		Description:      optionalPgText(fmt.Sprintf("Storefront order %s payment (%s)", order.OrderReference, attempt.Provider)),
	})
	if err != nil {
		return fmt.Errorf("create ledger entry: %w", err)
	}

	// Fee calculations:
	// If merchant bears fee:
	// Debit Clearing: attempt.AmountMinor - attempt.FeeMinor
	// Debit Expense: attempt.FeeMinor
	// Credit Revenue: order.TotalMinor - order.TaxMinor
	// Credit Tax: order.TaxMinor
	// If customer bears fee:
	// Customer total paid includes fee: order.TotalMinor = items + deliv + fee.
	// Net in clearing = attempt.AmountMinor - attempt.FeeMinor = items + deliv.
	// Debit Clearing: netAmount
	// Credit Revenue: netAmount - tax
	// Credit Tax: tax
	netMinor := attempt.AmountMinor - attempt.FeeMinor
	if netMinor < 0 {
		netMinor = 0
	}

	// Debit: Clearing account
	if netMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   attempt.WorkspaceID,
			AccountID:     pgtype.Int8{Int64: clearingAccID, Valid: true},
			AccountClass:  "asset",
			DebitMinor:    netMinor,
			CreditMinor:   0,
			Description:   optionalPgText(fmt.Sprintf("Net settlement to %s clearing", attempt.Provider)),
		}); err != nil {
			return fmt.Errorf("debit clearing: %w", err)
		}
	}

	// Debit: Processing fee expense if fee > 0
	if attempt.FeeMinor > 0 && order.ProcessingFeeMinor == 0 {
		// Merchant bore the fee
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   attempt.WorkspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "expense",
			DebitMinor:    attempt.FeeMinor,
			CreditMinor:   0,
			Description:   optionalPgText(fmt.Sprintf("Payment processing fee (%s)", attempt.Provider)),
		}); err != nil {
			return fmt.Errorf("debit fee: %w", err)
		}
	}

	// Credit: Sales Revenue & Tax
	taxMinor := order.TaxMinor
	revenueMinor := order.TotalMinor - taxMinor
	if order.ProcessingFeeMinor > 0 {
		// Customer paid the fee, so revenue is total minus fee minus tax
		revenueMinor = order.TotalMinor - order.ProcessingFeeMinor - taxMinor
	}
	if revenueMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   attempt.WorkspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "revenue",
			DebitMinor:    0,
			CreditMinor:   revenueMinor,
			Description:   optionalPgText("Online store sales revenue"),
		}); err != nil {
			return fmt.Errorf("credit revenue: %w", err)
		}
	}
	if taxMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   attempt.WorkspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "liability",
			DebitMinor:    0,
			CreditMinor:   taxMinor,
			Description:   optionalPgText("Sales tax payable"),
		}); err != nil {
			return fmt.Errorf("credit tax: %w", err)
		}
	}

	// Update clearing balance
	_, _ = tx.Exec(ctx, `
		UPDATE money_accounts
		SET current_balance_minor = current_balance_minor + $1, updated_at = now()
		WHERE id = $2
	`, netMinor, clearingAccID)

	// 5. Update Order status
	_, err = q.UpdateStorefrontOrderPaymentStatus(ctx, db.UpdateStorefrontOrderPaymentStatusParams{
		WorkspaceID:   attempt.WorkspaceID,
		ID:            order.ID,
		PaymentStatus: "paid",
		LinkedSaleID:  pgtype.Int8{Int64: sale.ID, Valid: true},
	})
	if err != nil {
		return err
	}
	_, _ = tx.Exec(ctx, `
		UPDATE storefront_orders
		SET commercial_status = 'confirmed', reservation_expires_at = NULL, updated_at = now()
		WHERE workspace_id = $1 AND id = $2
	`, attempt.WorkspaceID, order.ID)

	// Order event
	_, _ = q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     attempt.WorkspaceID,
		OrderID:         order.ID,
		EventType:       "payment_confirmed",
		ActorType:       "system",
		CustomerVisible: true,
		Message:         optionalPgText(fmt.Sprintf("Payment received via %s. Reference: %s", attempt.Provider, attempt.Reference)),
	})

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	// Async email notification if email is configured
	if s.emailProvider != nil && order.CustomerEmail.Valid && strings.TrimSpace(order.CustomerEmail.String) != "" {
		_, _ = s.emailProvider.SendEmail(ctx, notify.SendEmailRequest{
			To:       order.CustomerEmail.String,
			Subject:  fmt.Sprintf("Payment Confirmed: Order %s", order.OrderReference),
			HTMLBody: fmt.Sprintf("<p>Hi %s,</p><p>We have received your payment for order <strong>%s</strong>.</p><p>Total: %s %s</p>", order.CustomerName, order.OrderReference, order.Currency, decimal.NewFromInt(order.TotalMinor).Div(decimal.NewFromInt(100)).StringFixed(2)),
		})
	}

	return nil
}

// MarkStorefrontOrderPaidManual handles "Mark paid" for manual bank transfers and "Collected" for COD/pickup.
func (s *Service) MarkStorefrontOrderPaidManual(ctx context.Context, wsID, orderID, moneyAccountID int64, notes string) error {
	if moneyAccountID <= 0 {
		return errors.New("money account is required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	if _, err := q.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: moneyAccountID, WorkspaceID: wsID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrForbiddenAccount
		}
		return err
	}

	order, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{
		WorkspaceID: wsID,
		ID:          orderID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if order.PaymentStatus == "paid" {
		return nil
	}

	// Turn hold firm
	_, _ = tx.Exec(ctx, `
		UPDATE stock_reservations
		SET expires_at = NULL, updated_at = now()
		WHERE workspace_id = $1 AND order_id = $2 AND status = 'active'
	`, wsID, order.ID)

	// Create Sale
	saleDate := time.Now().UTC()
	if order.CreatedAt.Valid {
		saleDate = order.CreatedAt.Time.UTC()
	}
	sale, err := q.CreateStorefrontOrderSale(ctx, db.CreateStorefrontOrderSaleParams{
		WorkspaceID:       wsID,
		CustomerID:        order.CustomerID,
		CustomerName:      order.CustomerName,
		SaleDate:          pgtype.Date{Time: saleDate, Valid: true},
		TotalAmountMinor:  order.TotalMinor,
		PaidAmountMinor:   order.TotalMinor,
		Currency:          order.Currency,
		CurrencyExponent:  order.CurrencyExponent,
		Notes:             pgtype.Text{String: "Manual payment for online store order " + order.OrderReference, Valid: true},
		Reference:         pgtype.Text{String: order.OrderReference, Valid: true},
		IdempotencyKey:    pgtype.Text{String: fmt.Sprintf("online-store-order-manual-%d", order.ID), Valid: true},
		CreatedByUserID:   pgtype.Int8{Valid: false},
		StorefrontOrderID: pgtype.Int8{Int64: order.ID, Valid: true},
	})
	if err != nil {
		return err
	}
	_, _ = tx.Exec(ctx, `UPDATE sales SET source = 'online_store' WHERE id = $1`, sale.ID)

	lines, err := q.ListStorefrontOrderLines(ctx, order.ID)
	if err != nil {
		return err
	}
	for _, line := range lines {
		if line.ConfirmedQuantity.IsZero() {
			continue
		}
		if _, err := q.CreateStorefrontOrderSaleItem(ctx, db.CreateStorefrontOrderSaleItemParams{
			WorkspaceID:    wsID,
			SaleID:         sale.ID,
			ProductID:      pgtype.Int8{Int64: line.ProductID, Valid: line.ProductID > 0},
			VariantID:      line.VariantID,
			Description:    line.TitleSnapshot,
			Quantity:       line.ConfirmedQuantity,
			UnitPriceMinor: line.UnitPriceMinor,
			AmountMinor:    line.LineTotalMinor,
		}); err != nil {
			return err
		}
	}

	// Ledger Entry
	ledgerEntry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      wsID,
		SourceType:       "sale",
		SourceID:         sale.ID,
		EntryDate:        pgtype.Date{Time: time.Now().UTC(), Valid: true},
		Currency:         order.Currency,
		CurrencyExponent: order.CurrencyExponent,
		Description:      optionalPgText(fmt.Sprintf("Manual payment for storefront order %s", order.OrderReference)),
	})
	if err != nil {
		return err
	}

	// Debit: Money account (Bank / Cash)
	if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
		LedgerEntryID: ledgerEntry.ID,
		WorkspaceID:   wsID,
		AccountID:     pgtype.Int8{Int64: moneyAccountID, Valid: true},
		AccountClass:  "asset",
		DebitMinor:    order.TotalMinor,
		CreditMinor:   0,
		Description:   optionalPgText("Receipt into money account"),
	}); err != nil {
		return err
	}

	// Credit: Revenue & Tax
	taxMinor := order.TaxMinor
	revenueMinor := order.TotalMinor - taxMinor
	if revenueMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   wsID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "revenue",
			DebitMinor:    0,
			CreditMinor:   revenueMinor,
			Description:   optionalPgText("Online store sales revenue"),
		}); err != nil {
			return err
		}
	}
	if taxMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   wsID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "liability",
			DebitMinor:    0,
			CreditMinor:   taxMinor,
			Description:   optionalPgText("Sales tax payable"),
		}); err != nil {
			return err
		}
	}

	// Update money account balance
	_, _ = tx.Exec(ctx, `
		UPDATE money_accounts
		SET current_balance_minor = current_balance_minor + $1, updated_at = now()
		WHERE id = $2 AND workspace_id = $3
	`, order.TotalMinor, moneyAccountID, wsID)

	_, err = q.UpdateStorefrontOrderPaymentStatus(ctx, db.UpdateStorefrontOrderPaymentStatusParams{
		WorkspaceID:   wsID,
		ID:            order.ID,
		PaymentStatus: "paid",
		LinkedSaleID:  pgtype.Int8{Int64: sale.ID, Valid: true},
	})
	if err != nil {
		return err
	}
	_, _ = tx.Exec(ctx, `
		UPDATE storefront_orders
		SET commercial_status = 'confirmed', reservation_expires_at = NULL, updated_at = now()
		WHERE workspace_id = $1 AND id = $2
	`, wsID, order.ID)

	// Create order event
	msg := "Payment confirmed manually by merchant."
	if notes != "" {
		msg += " Note: " + notes
	}
	_, _ = q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     wsID,
		OrderID:         order.ID,
		EventType:       "payment_confirmed",
		ActorType:       "merchant",
		CustomerVisible: true,
		Message:         optionalPgText(msg),
	})

	return tx.Commit(ctx)
}

// RecordPayoutFromProvider moves funds from Clearing to the Merchant's chosen bank money account.
func (s *Service) RecordPayoutFromProvider(ctx context.Context, wsID int64, in RecordPayoutInput) error {
	if in.AmountMinor <= 0 {
		return errors.New("amount must be greater than zero")
	}
	provider := strings.ToLower(strings.TrimSpace(in.Provider))
	if provider == "" {
		provider = "paystack"
	}
	clearingName := fmt.Sprintf("Payment provider clearing (%s)", strings.Title(provider))

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	var clearingAccID int64
	var currency string
	err = tx.QueryRow(ctx, `SELECT id, currency FROM money_accounts WHERE workspace_id = $1 AND name = $2`, wsID, clearingName).Scan(&clearingAccID, &currency)
	if err != nil {
		return fmt.Errorf("clearing account not found: %w", err)
	}

	var destID int64
	err = tx.QueryRow(ctx, `SELECT id FROM money_accounts WHERE workspace_id = $1 AND id = $2`, wsID, in.DestinationAccID).Scan(&destID)
	if err != nil {
		return fmt.Errorf("destination money account not found: %w", err)
	}

	// Create money_transaction transfer
	txnDate := time.Now().UTC()
	var txnID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO money_transactions (
			workspace_id, direction, status, amount_minor, currency, currency_exponent,
			effective_date, money_account_id, destination_account_id, purpose, notes, reference, idempotency_key
		) VALUES (
			$1, 'transfer', 'posted', $2, $3, 2, $4, $5, $6, 'payout', $7, $8, $9
		) RETURNING id
	`, wsID, in.AmountMinor, currency, txnDate, clearingAccID, destID, optionalPgText(in.Notes), optionalPgText(in.Reference), optionalPgText(in.IdempotencyKey)).Scan(&txnID)
	if err != nil {
		return err
	}

	// Balanced ledger entry:
	// Debit: Destination bank account (Asset +)
	// Credit: Clearing account (Asset -)
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      wsID,
		SourceType:       "money_transaction",
		SourceID:         txnID,
		EntryDate:        pgtype.Date{Time: txnDate, Valid: true},
		Currency:         currency,
		CurrencyExponent: 2,
		Description:      optionalPgText(fmt.Sprintf("Payout from %s to bank", provider)),
	})
	if err != nil {
		return err
	}

	// Debit Destination
	if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
		LedgerEntryID: entry.ID,
		WorkspaceID:   wsID,
		AccountID:     pgtype.Int8{Int64: destID, Valid: true},
		AccountClass:  "asset",
		DebitMinor:    in.AmountMinor,
		CreditMinor:   0,
		Description:   optionalPgText("Payout received into bank"),
	}); err != nil {
		return err
	}

	// Credit Clearing
	if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
		LedgerEntryID: entry.ID,
		WorkspaceID:   wsID,
		AccountID:     pgtype.Int8{Int64: clearingAccID, Valid: true},
		AccountClass:  "asset",
		DebitMinor:    0,
		CreditMinor:   in.AmountMinor,
		Description:   optionalPgText(fmt.Sprintf("Transfer from %s clearing", provider)),
	}); err != nil {
		return err
	}

	// Update account balances
	_, _ = tx.Exec(ctx, `UPDATE money_accounts SET current_balance_minor = current_balance_minor - $1 WHERE id = $2`, in.AmountMinor, clearingAccID)
	_, _ = tx.Exec(ctx, `UPDATE money_accounts SET current_balance_minor = current_balance_minor + $1 WHERE id = $2`, in.AmountMinor, destID)

	return tx.Commit(ctx)
}
