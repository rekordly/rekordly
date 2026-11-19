package finance

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
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
	if s.storefrontPaymentProviders == nil || len(s.storefrontPaymentProviders) == 0 {
		return nil, ErrProviderNotAvailable
	}
	key = strings.ToLower(strings.TrimSpace(key))
	if key == "" {
		if p, ok := s.storefrontPaymentProviders["paystack"]; ok && p != nil {
			return p, nil
		}
		keys := make([]string, 0, len(s.storefrontPaymentProviders))
		for k, p := range s.storefrontPaymentProviders {
			if p != nil {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		if len(keys) == 0 {
			return nil, ErrProviderNotAvailable
		}
		return s.storefrontPaymentProviders[keys[0]], nil
	}
	p, ok := s.storefrontPaymentProviders[key]
	if !ok || p == nil {
		return nil, ErrProviderNotAvailable
	}
	return p, nil
}

func activeRegisteredProviders(accounts []db.MerchantPayoutAccount, providers map[string]payments.Provider) []string {
	var out []string
	seen := map[string]bool{}
	for _, pa := range accounts {
		if pa.Status != "active" || seen[pa.Provider] {
			continue
		}
		if p, ok := providers[pa.Provider]; ok && p != nil {
			seen[pa.Provider] = true
			out = append(out, pa.Provider)
		}
	}
	sort.Strings(out)
	return out
}

// selectPrimaryPayoutAccount picks the preferred active registered payout account, or
// falls back to the most recently updated active registered account (preferring "paystack" on tie).
func selectPrimaryPayoutAccount(accounts []db.MerchantPayoutAccount, providers map[string]payments.Provider, preferred string) (*db.MerchantPayoutAccount, payments.Provider) {
	pref := strings.ToLower(strings.TrimSpace(preferred))
	var active []db.MerchantPayoutAccount
	for _, pa := range accounts {
		if pa.Status != "active" {
			continue
		}
		p, ok := providers[pa.Provider]
		if !ok || p == nil {
			continue
		}
		if pref != "" && pa.Provider == pref {
			chosen := pa
			return &chosen, p
		}
		active = append(active, pa)
	}
	if len(active) == 0 {
		return nil, nil
	}
	sort.Slice(active, func(i, j int) bool {
		ti := active[i].UpdatedAt.Time
		tj := active[j].UpdatedAt.Time
		if !ti.Equal(tj) {
			return ti.After(tj)
		}
		if active[i].Provider == "paystack" && active[j].Provider != "paystack" {
			return true
		}
		if active[j].Provider == "paystack" && active[i].Provider != "paystack" {
			return false
		}
		return active[i].Provider < active[j].Provider
	})
	chosen := active[0]
	return &chosen, providers[chosen.Provider]
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
		chosen, _ := selectPrimaryPayoutAccount(accounts, s.storefrontPaymentProviders, "")
		if chosen == nil {
			fallback := accounts[0]
			for _, a := range accounts {
				if a.Status == "active" {
					fallback = a
					break
				}
			}
			chosen = &fallback
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
	sort.Strings(avail)
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

func webhookEventKey(ev payments.Event) string {
	evType := strings.ToLower(strings.TrimSpace(ev.Type))
	if evType == "" {
		evType = strings.ToLower(strings.TrimSpace(ev.Status))
	}
	ref := strings.TrimSpace(ev.Reference)
	if id := strings.TrimSpace(ev.ProviderEventID); id != "" {
		return fmt.Sprintf("%s:%s:%s", evType, id, ref)
	}
	return fmt.Sprintf("%s:%s", evType, ref)
}

func computeCommissionMinor(amountMinor int64, commissionPercent float64) int64 {
	if amountMinor <= 0 || commissionPercent <= 0 {
		return 0
	}
	return decimal.NewFromInt(amountMinor).
		Mul(decimal.NewFromFloat(commissionPercent)).
		Div(decimal.NewFromInt(100)).
		Round(0).
		IntPart()
}

func formatDisplayMoney(currency string, minor int64, exponent int) string {
	major := FormatMinorToMajor(minor, exponent)
	if strings.EqualFold(strings.TrimSpace(currency), "NGN") {
		return "₦" + major
	}
	return strings.ToUpper(strings.TrimSpace(currency)) + " " + major
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
	return s.processStorefrontPaymentEvent(ctx, providerKey, event)
}

func (s *Service) processStorefrontPaymentEvent(ctx context.Context, providerKey string, event payments.Event) error {
	evKey := webhookEventKey(event)

	attempt, err := s.queries.GetStorefrontPaymentAttemptByReference(ctx, event.Reference)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			_, _ = s.queries.InsertPaymentWebhookEvent(ctx, db.InsertPaymentWebhookEventParams{
				Provider: providerKey,
				EventID:  evKey,
				Outcome:  "ignored_unknown_reference",
			})
			return nil
		}
		return err
	}
	if attempt.Provider != providerKey {
		return nil
	}

	if event.Status == "failed" || event.Status == "rejected" {
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback(ctx) }()
		q := s.queries.WithTx(tx)

		recorded, err := q.InsertPaymentWebhookEvent(ctx, db.InsertPaymentWebhookEventParams{
			Provider: providerKey,
			EventID:  evKey,
			Outcome:  "rejected",
		})
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && recorded.ID == 0) {
			return nil // already processed idempotently
		}
		if err != nil {
			return err
		}

		lockedAttempt, err := q.GetStorefrontPaymentAttemptByReferenceForUpdate(ctx, attempt.Reference)
		if err != nil {
			return err
		}
		if lockedAttempt.Status == "pending" {
			if _, err := q.UpdatePaymentAttemptSettlement(ctx, db.UpdatePaymentAttemptSettlementParams{
				WorkspaceID:         lockedAttempt.WorkspaceID,
				ID:                  lockedAttempt.ID,
				Status:              "rejected",
				FeeMinor:            lockedAttempt.FeeMinor,
				CommissionMinor:     lockedAttempt.CommissionMinor,
				ReceivedAmountMinor: lockedAttempt.ReceivedAmountMinor,
				RawEvent:            event.Raw,
			}); err != nil {
				return err
			}
		}
		return tx.Commit(ctx)
	}

	if event.Status == "paid" {
		attempt.FeeMinor = event.FeeMinor
		attempt.RawEvent = event.Raw
		return s.markStorefrontOrderPaidInternal(ctx, attempt, event.AmountMinor, providerKey, evKey)
	}

	return nil
}

// MarkStorefrontOrderPaid runs in one atomic transaction:
// 1. Records webhook idempotency (when called from a webhook) in the same transaction
// 2. Guards against duplicate payments and wrong amounts
// 3. Re-holds only inactive stock lines and turns active holds firm
// 4. Creates or links the Sale with source = online_store
// 5. Posts balanced ledger entries (Clearing, Processing Fee, Rekordly Commission, Revenue, Tax)
// 6. Writes order event and sends customer email
func (s *Service) MarkStorefrontOrderPaid(ctx context.Context, attempt db.StorefrontPaymentAttempt) error {
	return s.markStorefrontOrderPaidInternal(ctx, attempt, attempt.AmountMinor, attempt.Provider, "")
}

func (s *Service) markStorefrontOrderPaidInternal(
	ctx context.Context,
	attemptIn db.StorefrontPaymentAttempt,
	receivedAmountMinor int64,
	webhookProvider string,
	webhookEventID string,
) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	if webhookEventID != "" {
		recorded, wErr := q.InsertPaymentWebhookEvent(ctx, db.InsertPaymentWebhookEventParams{
			Provider: webhookProvider,
			EventID:  webhookEventID,
			Outcome:  "processed",
		})
		if errors.Is(wErr, pgx.ErrNoRows) || (wErr == nil && recorded.ID == 0) {
			return nil // already processed idempotently
		}
		if wErr != nil {
			return wErr
		}
	}

	attempt, err := q.GetStorefrontPaymentAttemptByReferenceForUpdate(ctx, attemptIn.Reference)
	if err != nil {
		return err
	}
	if attemptIn.FeeMinor > 0 {
		attempt.FeeMinor = attemptIn.FeeMinor
	}
	if len(attemptIn.RawEvent) > 0 {
		attempt.RawEvent = attemptIn.RawEvent
	}

	order, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{
		WorkspaceID: attempt.WorkspaceID,
		ID:          attempt.OrderID,
	})
	if err != nil {
		return err
	}

	if receivedAmountMinor <= 0 {
		receivedAmountMinor = attempt.AmountMinor
	}

	// Same attempt already marked paid -> idempotent replay
	if attempt.Status == "paid" && (order.PaymentStatus == "paid" || order.LinkedSaleID.Valid) {
		if webhookEventID != "" {
			return tx.Commit(ctx)
		}
		return nil
	}

	// B8: Never post revenue twice when order is already paid (manual Mark paid or another attempt)
	if order.PaymentStatus == "paid" || order.LinkedSaleID.Valid {
		dupMsg := "Paid twice: refund one"
		if _, err := q.UpdatePaymentAttemptSettlement(ctx, db.UpdatePaymentAttemptSettlementParams{
			WorkspaceID:         attempt.WorkspaceID,
			ID:                  attempt.ID,
			Status:              "duplicate_payment",
			FeeMinor:            attempt.FeeMinor,
			CommissionMinor:     attempt.CommissionMinor,
			ReceivedAmountMinor: pgtype.Int8{Int64: receivedAmountMinor, Valid: true},
			RawEvent:            attempt.RawEvent,
		}); err != nil {
			return err
		}
		if _, err := q.SetStorefrontOrderPaymentAttention(ctx, db.SetStorefrontOrderPaymentAttentionParams{
			WorkspaceID:             attempt.WorkspaceID,
			ID:                      order.ID,
			PaymentAttentionReason:  optionalPgText("duplicate_payment"),
			PaymentAttentionMessage: optionalPgText(dupMsg),
		}); err != nil {
			return err
		}
		if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
			WorkspaceID:     attempt.WorkspaceID,
			OrderID:         order.ID,
			EventType:       "duplicate_payment",
			ActorType:       "system",
			CustomerVisible: false,
			Message:         optionalPgText(fmt.Sprintf("%s (ref: %s via %s)", dupMsg, attempt.Reference, attempt.Provider)),
		}); err != nil {
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		s.notifyStorefrontWorkspace(ctx, attempt.WorkspaceID, fmt.Sprintf("Duplicate payment on %s", order.OrderReference), dupMsg)
		return nil
	}

	// B7 & B11: Wrong amount by bank transfer (or attempt mismatch with order total)
	if receivedAmountMinor != order.TotalMinor || attempt.AmountMinor != order.TotalMinor {
		paidDisp := formatDisplayMoney(order.Currency, receivedAmountMinor, int(order.CurrencyExponent))
		orderDisp := formatDisplayMoney(order.Currency, order.TotalMinor, int(order.CurrencyExponent))
		mismatchMsg := fmt.Sprintf("Customer paid %s, order is %s: refund the difference or ask for the rest", paidDisp, orderDisp)

		if _, err := q.UpdatePaymentAttemptSettlement(ctx, db.UpdatePaymentAttemptSettlementParams{
			WorkspaceID:         attempt.WorkspaceID,
			ID:                  attempt.ID,
			Status:              "paid_wrong_amount",
			FeeMinor:            attempt.FeeMinor,
			CommissionMinor:     attempt.CommissionMinor,
			ReceivedAmountMinor: pgtype.Int8{Int64: receivedAmountMinor, Valid: true},
			RawEvent:            attempt.RawEvent,
		}); err != nil {
			return err
		}
		if _, err := q.SetStorefrontOrderPaymentAttention(ctx, db.SetStorefrontOrderPaymentAttentionParams{
			WorkspaceID:             attempt.WorkspaceID,
			ID:                      order.ID,
			PaymentAttentionReason:  optionalPgText("wrong_amount"),
			PaymentAttentionMessage: optionalPgText(mismatchMsg),
		}); err != nil {
			return err
		}
		if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
			WorkspaceID:     attempt.WorkspaceID,
			OrderID:         order.ID,
			EventType:       "payment_wrong_amount",
			ActorType:       "system",
			CustomerVisible: true,
			Message:         optionalPgText(mismatchMsg),
		}); err != nil {
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		s.notifyStorefrontWorkspace(ctx, attempt.WorkspaceID, fmt.Sprintf("Wrong amount paid on %s", order.OrderReference), mismatchMsg)
		return nil
	}

	// B9: Check per-line reservations and re-hold ONLY lines whose reservation is no longer active.
	lines, err := q.ListStorefrontOrderLines(ctx, order.ID)
	if err != nil {
		return err
	}
	sort.Slice(lines, func(i, j int) bool {
		if lines[i].ProductID != lines[j].ProductID {
			return lines[i].ProductID < lines[j].ProductID
		}
		return lines[i].VariantID.Int64 < lines[j].VariantID.Int64
	})

	var linesToRehold []db.StorefrontOrderLine
	for _, l := range lines {
		if l.ProductKind != "stock_tracked" || l.ConfirmedQuantity.IsZero() {
			continue
		}
		if l.ReservationID.Valid {
			res, rErr := q.GetStockReservationForUpdate(ctx, db.GetStockReservationForUpdateParams{
				WorkspaceID: attempt.WorkspaceID,
				ID:          l.ReservationID.Int64,
			})
			if rErr == nil && res.Status == "active" {
				// Still active! Do not double-reserve; MakeOrderReservationsFirm will make it firm.
				continue
			}
		}
		linesToRehold = append(linesToRehold, l)
	}

	if len(linesToRehold) > 0 {
		stockAvailable := true
		for _, l := range linesToRehold {
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
			lateMsg := "Late payment received after reservation expired, but stock is unavailable. Merchant attention required (refund or restock)."
			if _, err := q.UpdatePaymentAttemptSettlement(ctx, db.UpdatePaymentAttemptSettlementParams{
				WorkspaceID:         attempt.WorkspaceID,
				ID:                  attempt.ID,
				Status:              "paid",
				FeeMinor:            attempt.FeeMinor,
				CommissionMinor:     attempt.CommissionMinor,
				ReceivedAmountMinor: pgtype.Int8{Int64: receivedAmountMinor, Valid: true},
				RawEvent:            attempt.RawEvent,
			}); err != nil {
				return err
			}
			if _, err := q.SetStorefrontOrderPaymentAttention(ctx, db.SetStorefrontOrderPaymentAttentionParams{
				WorkspaceID:             attempt.WorkspaceID,
				ID:                      order.ID,
				PaymentAttentionReason:  optionalPgText("late_payment_out_of_stock"),
				PaymentAttentionMessage: optionalPgText(lateMsg),
			}); err != nil {
				return err
			}
			if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
				WorkspaceID:     attempt.WorkspaceID,
				OrderID:         order.ID,
				EventType:       "payment_needs_attention",
				ActorType:       "system",
				CustomerVisible: true,
				Message:         optionalPgText(lateMsg),
			}); err != nil {
				return err
			}
			if err := tx.Commit(ctx); err != nil {
				return err
			}
			s.notifyStorefrontWorkspace(ctx, attempt.WorkspaceID, fmt.Sprintf("Late payment needs attention on %s", order.OrderReference), lateMsg)
			return nil
		}

		for _, l := range linesToRehold {
			bal, bErr := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
				WorkspaceID: attempt.WorkspaceID,
				LocationID:  order.OutletID.Int64,
				ProductID:   l.ProductID,
				VariantID:   l.VariantID,
			})
			if bErr != nil {
				return bErr
			}
			if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
				WorkspaceID:       attempt.WorkspaceID,
				LocationID:        order.OutletID.Int64,
				ProductID:         l.ProductID,
				VariantID:         l.VariantID,
				QuantityOnHand:    bal.QuantityOnHand,
				ReservedQuantity:  bal.ReservedQuantity.Add(l.ConfirmedQuantity),
				InTransitQuantity: bal.InTransitQuantity,
				ValueOnHandMinor:  bal.ValueOnHandMinor,
			}); err != nil {
				return err
			}
			res, rErr := q.CreateStockReservation(ctx, db.CreateStockReservationParams{
				WorkspaceID:    attempt.WorkspaceID,
				LocationID:     order.OutletID.Int64,
				ProductID:      l.ProductID,
				VariantID:      l.VariantID,
				OrderID:        pgtype.Int8{Int64: order.ID, Valid: true},
				Quantity:       l.ConfirmedQuantity,
				Status:         "active",
				ExpiresAt:      pgtype.Timestamptz{Valid: false}, // firm hold
				Notes:          pgtype.Text{String: "Re-reserved for paid order " + order.OrderReference, Valid: true},
				IdempotencyKey: pgtype.Text{String: fmt.Sprintf("sf-order-%d-line-%d-rehold-%d", order.ID, l.ID, attempt.ID), Valid: true},
			})
			if rErr != nil {
				return rErr
			}
			if _, err := q.UpdateStorefrontOrderLineReservation(ctx, db.UpdateStorefrontOrderLineReservationParams{
				ID:                l.ID,
				ReservationID:     pgtype.Int8{Int64: res.ID, Valid: true},
				ConfirmedQuantity: l.ConfirmedQuantity,
				UnitPriceMinor:    l.UnitPriceMinor,
				LineTotalMinor:    l.LineTotalMinor,
			}); err != nil {
				return err
			}
		}
	}

	commissionMinor := attempt.CommissionMinor
	if commissionMinor == 0 && s.platformCommissionPercent > 0 {
		commissionMinor = computeCommissionMinor(attempt.AmountMinor, s.platformCommissionPercent)
	}

	// 1. Mark attempt paid
	if _, err := q.UpdatePaymentAttemptSettlement(ctx, db.UpdatePaymentAttemptSettlementParams{
		WorkspaceID:         attempt.WorkspaceID,
		ID:                  attempt.ID,
		Status:              "paid",
		FeeMinor:            attempt.FeeMinor,
		CommissionMinor:     commissionMinor,
		ReceivedAmountMinor: pgtype.Int8{Int64: receivedAmountMinor, Valid: true},
		RawEvent:            attempt.RawEvent,
	}); err != nil {
		return err
	}

	// 2. Turn all active holds firm (expires_at = NULL)
	if err := q.MakeOrderReservationsFirm(ctx, db.MakeOrderReservationsFirmParams{
		WorkspaceID: attempt.WorkspaceID,
		OrderID:     pgtype.Int8{Int64: order.ID, Valid: true},
	}); err != nil {
		return err
	}

	// 3. Create or link Sale + post balanced ledger entries
	sale, err := s.postOnlineStoreProviderSaleAndLedgerTx(ctx, q, order, lines, attempt.Provider, attempt.Reference, attempt.AmountMinor, attempt.FeeMinor, commissionMinor)
	if err != nil {
		return err
	}

	// 4. Update Order status (re-opening cancelled order to confirmed/reserved, clearing expiry & attention)
	if _, err := q.FinalizeStorefrontOrderPayment(ctx, db.FinalizeStorefrontOrderPaymentParams{
		WorkspaceID:  attempt.WorkspaceID,
		ID:           order.ID,
		LinkedSaleID: pgtype.Int8{Int64: sale.ID, Valid: true},
	}); err != nil {
		return err
	}

	// 5. Order event
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     attempt.WorkspaceID,
		OrderID:         order.ID,
		EventType:       "payment_confirmed",
		ActorType:       "system",
		CustomerVisible: true,
		Message:         optionalPgText(fmt.Sprintf("Payment received via %s. Reference: %s", attempt.Provider, attempt.Reference)),
	}); err != nil {
		return err
	}

	if s.beforeMarkPaidCommitHook != nil {
		if hErr := s.beforeMarkPaidCommitHook(ctx, order.ID); hErr != nil {
			return hErr
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	// Book Shipbubble shipment after payment commits; failure leaves order paid with retry flag.
	if order.DeliveryMethod == "courier" && (!order.CourierTrackingNumber.Valid || strings.TrimSpace(order.CourierTrackingNumber.String) == "") {
		_ = s.BookStorefrontShipment(ctx, attempt.WorkspaceID, order.ID)
	}

	// B12: Receipt email amount formatted with order's currency exponent
	if s.emailProvider != nil && order.CustomerEmail.Valid && strings.TrimSpace(order.CustomerEmail.String) != "" {
		formattedTotal := FormatMinorToMajor(order.TotalMinor, int(order.CurrencyExponent))
		_, _ = s.emailProvider.SendEmail(ctx, notify.SendEmailRequest{
			To:       order.CustomerEmail.String,
			Subject:  fmt.Sprintf("Payment Confirmed: Order %s", order.OrderReference),
			HTMLBody: fmt.Sprintf("<p>Hi %s,</p><p>We have received your payment for order <strong>%s</strong>.</p><p>Total: %s %s</p>", order.CustomerName, order.OrderReference, order.Currency, formattedTotal),
		})
	}

	return nil
}

func (s *Service) postOnlineStoreProviderSaleAndLedgerTx(
	ctx context.Context,
	q *db.Queries,
	order db.StorefrontOrder,
	lines []db.StorefrontOrderLine,
	provider string,
	reference string,
	grossPaidMinor int64,
	feeMinor int64,
	commissionMinor int64,
) (db.Sale, error) {
	if grossPaidMinor <= 0 {
		return db.Sale{}, errors.New("paid amount must be positive")
	}
	var sale db.Sale
	existingSale, sErr := q.GetSaleByStorefrontOrder(ctx, db.GetSaleByStorefrontOrderParams{
		WorkspaceID:       order.WorkspaceID,
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
			WorkspaceID:       order.WorkspaceID,
			CustomerID:        order.CustomerID,
			CustomerName:      order.CustomerName,
			SaleDate:          pgtype.Date{Time: saleDate, Valid: true},
			TotalAmountMinor:  grossPaidMinor,
			PaidAmountMinor:   grossPaidMinor,
			Currency:          order.Currency,
			CurrencyExponent:  order.CurrencyExponent,
			Notes:             pgtype.Text{String: "Paid online store order " + order.OrderReference, Valid: true},
			Reference:         pgtype.Text{String: order.OrderReference, Valid: true},
			IdempotencyKey:    pgtype.Text{String: fmt.Sprintf("online-store-order-%d", order.ID), Valid: true},
			CreatedByUserID:   pgtype.Int8{Valid: false},
			StorefrontOrderID: pgtype.Int8{Int64: order.ID, Valid: true},
		})
		if err != nil {
			return db.Sale{}, err
		}
		if err := q.UpdateSaleSource(ctx, db.UpdateSaleSourceParams{
			WorkspaceID: order.WorkspaceID,
			ID:          newSale.ID,
			Source:      "online_store",
		}); err != nil {
			return db.Sale{}, err
		}
		sale = newSale

		for _, line := range lines {
			if line.ConfirmedQuantity.IsZero() {
				continue
			}
			if _, err := q.CreateStorefrontOrderSaleItem(ctx, db.CreateStorefrontOrderSaleItemParams{
				WorkspaceID:    order.WorkspaceID,
				SaleID:         sale.ID,
				ProductID:      pgtype.Int8{Int64: line.ProductID, Valid: line.ProductID > 0},
				VariantID:      line.VariantID,
				Description:    line.TitleSnapshot,
				Quantity:       line.ConfirmedQuantity,
				UnitPriceMinor: line.UnitPriceMinor,
				AmountMinor:    line.LineTotalMinor,
			}); err != nil {
				return db.Sale{}, err
			}
		}
	} else {
		return db.Sale{}, sErr
	}

	// Find or create Clearing money account via sqlc
	clearingName := fmt.Sprintf("Payment provider clearing (%s)", strings.Title(provider))
	clearingAcc, err := q.GetMoneyAccountByName(ctx, db.GetMoneyAccountByNameParams{
		WorkspaceID: order.WorkspaceID,
		Lower:       clearingName,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		clearingAcc, err = q.CreateClearingMoneyAccount(ctx, db.CreateClearingMoneyAccountParams{
			WorkspaceID:      order.WorkspaceID,
			Name:             clearingName,
			Currency:         order.Currency,
			CurrencyExponent: order.CurrencyExponent,
		})
	}
	if err != nil {
		return db.Sale{}, fmt.Errorf("clearing money account: %w", err)
	}

	ledgerEntry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      order.WorkspaceID,
		SourceType:       "sale",
		SourceID:         sale.ID,
		EntryDate:        pgtype.Date{Time: time.Now().UTC(), Valid: true},
		Currency:         order.Currency,
		CurrencyExponent: order.CurrencyExponent,
		Description:      optionalPgText(fmt.Sprintf("Storefront order %s payment (%s %s)", order.OrderReference, provider, reference)),
	})
	if err != nil {
		return db.Sale{}, fmt.Errorf("create ledger entry: %w", err)
	}

	clearingNet := grossPaidMinor - feeMinor - commissionMinor
	if clearingNet < 0 {
		return db.Sale{}, ErrLedgerUnbalanced
	}

	var totalDebits, totalCredits int64

	// Debit: Clearing account (Asset)
	if clearingNet > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   order.WorkspaceID,
			AccountID:     pgtype.Int8{Int64: clearingAcc.ID, Valid: true},
			AccountClass:  "asset",
			DebitMinor:    clearingNet,
			CreditMinor:   0,
			Description:   optionalPgText(fmt.Sprintf("Net settlement to %s clearing", provider)),
		}); err != nil {
			return db.Sale{}, fmt.Errorf("debit clearing: %w", err)
		}
		totalDebits += clearingNet
	}

	// Debit: Provider processing fee (Expense)
	if feeMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   order.WorkspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "expense",
			DebitMinor:    feeMinor,
			CreditMinor:   0,
			Description:   optionalPgText(fmt.Sprintf("Payment processing fee (%s)", provider)),
		}); err != nil {
			return db.Sale{}, fmt.Errorf("debit fee: %w", err)
		}
		totalDebits += feeMinor
	}

	// B11: Debit: Rekordly commission (Expense)
	if commissionMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   order.WorkspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "expense",
			DebitMinor:    commissionMinor,
			CreditMinor:   0,
			Description:   optionalPgText("Rekordly commission"),
		}); err != nil {
			return db.Sale{}, fmt.Errorf("debit commission: %w", err)
		}
		totalDebits += commissionMinor
	}

	// Credit: Sales Revenue, Fee Recovery (if customer bore fee), and Tax
	taxMinor := order.TaxMinor
	if taxMinor > grossPaidMinor {
		taxMinor = 0
	}
	feeRecoveryMinor := order.ProcessingFeeMinor
	if feeRecoveryMinor < 0 || feeRecoveryMinor > (grossPaidMinor-taxMinor) {
		feeRecoveryMinor = 0
	}
	revenueMinor := grossPaidMinor - feeRecoveryMinor - taxMinor

	if revenueMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   order.WorkspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "revenue",
			DebitMinor:    0,
			CreditMinor:   revenueMinor,
			Description:   optionalPgText("Online store sales revenue"),
		}); err != nil {
			return db.Sale{}, fmt.Errorf("credit revenue: %w", err)
		}
		totalCredits += revenueMinor
	}
	if feeRecoveryMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   order.WorkspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "revenue",
			DebitMinor:    0,
			CreditMinor:   feeRecoveryMinor,
			Description:   optionalPgText("Payment processing fee recovery"),
		}); err != nil {
			return db.Sale{}, fmt.Errorf("credit fee recovery: %w", err)
		}
		totalCredits += feeRecoveryMinor
	}
	if taxMinor > 0 {
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: ledgerEntry.ID,
			WorkspaceID:   order.WorkspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "liability",
			DebitMinor:    0,
			CreditMinor:   taxMinor,
			Description:   optionalPgText("Sales tax payable"),
		}); err != nil {
			return db.Sale{}, fmt.Errorf("credit tax: %w", err)
		}
		totalCredits += taxMinor
	}

	if totalDebits != totalCredits {
		return db.Sale{}, ErrLedgerUnbalanced
	}

	if _, err := q.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
		ID:                  clearingAcc.ID,
		WorkspaceID:         order.WorkspaceID,
		CurrentBalanceMinor: clearingNet,
	}); err != nil {
		return db.Sale{}, fmt.Errorf("update clearing balance: %w", err)
	}

	return sale, nil
}

type ResolvePaymentAttentionInput struct {
	Action string `json:"action" binding:"required"` // "accept_as_paid" | "cancel_with_refund"
	Note   string `json:"note"`
}

func (s *Service) ResolveStorefrontOrderPaymentAttention(ctx context.Context, wsID, userID, orderID int64, in ResolvePaymentAttentionInput) (MerchantOrderView, error) {
	action := strings.ToLower(strings.TrimSpace(in.Action))
	if action != "accept_as_paid" && action != "cancel_with_refund" {
		return MerchantOrderView{}, errors.New("action must be accept_as_paid or cancel_with_refund")
	}
	cleanNote := sanitizePublicText(in.Note, 400)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	order, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{
		WorkspaceID: wsID,
		ID:          orderID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if order.PaymentStatus != "paid_needs_attention" {
		return MerchantOrderView{}, errors.New("order does not require payment attention resolution")
	}

	lines, err := q.ListStorefrontOrderLines(ctx, order.ID)
	if err != nil {
		return MerchantOrderView{}, err
	}
	sort.Slice(lines, func(i, j int) bool {
		if lines[i].ProductID != lines[j].ProductID {
			return lines[i].ProductID < lines[j].ProductID
		}
		return lines[i].VariantID.Int64 < lines[j].VariantID.Int64
	})

	if action == "cancel_with_refund" {
		if cleanNote == "" {
			cleanNote = "Order cancelled by merchant; refund noted"
		}
		for _, l := range lines {
			if !l.ReservationID.Valid {
				continue
			}
			res, rErr := q.GetStockReservationForUpdate(ctx, db.GetStockReservationForUpdateParams{
				WorkspaceID: wsID,
				ID:          l.ReservationID.Int64,
			})
			if rErr != nil || res.Status != "active" {
				continue
			}
			bal, bErr := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
				WorkspaceID: wsID,
				LocationID:  res.LocationID,
				ProductID:   res.ProductID,
				VariantID:   res.VariantID,
			})
			if bErr != nil && !errors.Is(bErr, pgx.ErrNoRows) {
				return MerchantOrderView{}, bErr
			}
			if bErr == nil {
				newRes := bal.ReservedQuantity.Sub(res.Quantity)
				if newRes.IsNegative() {
					newRes = decimal.Zero
				}
				if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
					WorkspaceID:       wsID,
					LocationID:        res.LocationID,
					ProductID:         res.ProductID,
					VariantID:         res.VariantID,
					QuantityOnHand:    bal.QuantityOnHand,
					ReservedQuantity:  newRes,
					InTransitQuantity: bal.InTransitQuantity,
					ValueOnHandMinor:  bal.ValueOnHandMinor,
				}); err != nil {
					return MerchantOrderView{}, err
				}
			}
			if _, err := q.UpdateStockReservationStatus(ctx, db.UpdateStockReservationStatusParams{
				WorkspaceID: wsID,
				ID:          res.ID,
				Status:      "released",
			}); err != nil {
				return MerchantOrderView{}, err
			}
		}

		updated, err := q.ResolveStorefrontOrderCancelWithRefund(ctx, db.ResolveStorefrontOrderCancelWithRefundParams{
			WorkspaceID:           wsID,
			ID:                    order.ID,
			DeclineOrCancelReason: optionalPgText(cleanNote),
		})
		if err != nil {
			return MerchantOrderView{}, err
		}
		if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
			WorkspaceID:     wsID,
			OrderID:         order.ID,
			EventType:       "order_cancelled",
			ActorType:       "merchant",
			ActorUserID:     pgtype.Int8{Int64: userID, Valid: userID > 0},
			CustomerVisible: true,
			Message:         optionalPgText("Order cancelled with refund note: " + cleanNote),
		}); err != nil {
			return MerchantOrderView{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return MerchantOrderView{}, err
		}
		invalidateStorefrontCache("")
		return s.buildMerchantOrderDetail(ctx, updated)
	}

	// action == "accept_as_paid"
	// Ensure stock is held for all tracked lines
	for _, l := range lines {
		if l.ProductKind != "stock_tracked" || l.ConfirmedQuantity.IsZero() {
			continue
		}
		if l.ReservationID.Valid {
			res, rErr := q.GetStockReservationForUpdate(ctx, db.GetStockReservationForUpdateParams{
				WorkspaceID: wsID,
				ID:          l.ReservationID.Int64,
			})
			if rErr == nil && res.Status == "active" {
				continue
			}
		}
		bal, bErr := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
			WorkspaceID: wsID,
			LocationID:  order.OutletID.Int64,
			ProductID:   l.ProductID,
			VariantID:   l.VariantID,
		})
		if bErr != nil || bal.QuantityOnHand.Sub(bal.ReservedQuantity).LessThan(l.ConfirmedQuantity) {
			return MerchantOrderView{}, fmt.Errorf("%w: %s is out of stock", ErrInsufficientStock, l.TitleSnapshot)
		}
		if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
			WorkspaceID:       wsID,
			LocationID:        order.OutletID.Int64,
			ProductID:         l.ProductID,
			VariantID:         l.VariantID,
			QuantityOnHand:    bal.QuantityOnHand,
			ReservedQuantity:  bal.ReservedQuantity.Add(l.ConfirmedQuantity),
			InTransitQuantity: bal.InTransitQuantity,
			ValueOnHandMinor:  bal.ValueOnHandMinor,
		}); err != nil {
			return MerchantOrderView{}, err
		}
		res, rErr := q.CreateStockReservation(ctx, db.CreateStockReservationParams{
			WorkspaceID:    wsID,
			LocationID:     order.OutletID.Int64,
			ProductID:      l.ProductID,
			VariantID:      l.VariantID,
			OrderID:        pgtype.Int8{Int64: order.ID, Valid: true},
			Quantity:       l.ConfirmedQuantity,
			Status:         "active",
			ExpiresAt:      pgtype.Timestamptz{Valid: false},
			Notes:          pgtype.Text{String: "Reserved on payment attention resolution " + order.OrderReference, Valid: true},
			IdempotencyKey: pgtype.Text{String: fmt.Sprintf("sf-order-%d-line-%d-resolve", order.ID, l.ID), Valid: true},
		})
		if rErr != nil {
			return MerchantOrderView{}, rErr
		}
		if _, err := q.UpdateStorefrontOrderLineReservation(ctx, db.UpdateStorefrontOrderLineReservationParams{
			ID:                l.ID,
			ReservationID:     pgtype.Int8{Int64: res.ID, Valid: true},
			ConfirmedQuantity: l.ConfirmedQuantity,
			UnitPriceMinor:    l.UnitPriceMinor,
			LineTotalMinor:    l.LineTotalMinor,
		}); err != nil {
			return MerchantOrderView{}, err
		}
	}

	if err := q.MakeOrderReservationsFirm(ctx, db.MakeOrderReservationsFirmParams{
		WorkspaceID: wsID,
		OrderID:     pgtype.Int8{Int64: order.ID, Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}

	var linkedSaleID pgtype.Int8 = order.LinkedSaleID
	if !linkedSaleID.Valid {
		att, aErr := q.GetLatestPaymentAttemptByOrder(ctx, db.GetLatestPaymentAttemptByOrderParams{
			WorkspaceID: wsID,
			OrderID:     order.ID,
		})
		if aErr != nil {
			return MerchantOrderView{}, aErr
		}
		settledAmount := order.TotalMinor
		if att.ReceivedAmountMinor.Valid && att.ReceivedAmountMinor.Int64 > 0 {
			settledAmount = att.ReceivedAmountMinor.Int64
		}
		commMinor := att.CommissionMinor
		if commMinor == 0 && s.platformCommissionPercent > 0 {
			commMinor = computeCommissionMinor(settledAmount, s.platformCommissionPercent)
		}
		if _, err := q.UpdatePaymentAttemptSettlement(ctx, db.UpdatePaymentAttemptSettlementParams{
			WorkspaceID:         wsID,
			ID:                  att.ID,
			Status:              "paid",
			FeeMinor:            att.FeeMinor,
			CommissionMinor:     commMinor,
			ReceivedAmountMinor: pgtype.Int8{Int64: settledAmount, Valid: true},
			RawEvent:            att.RawEvent,
		}); err != nil {
			return MerchantOrderView{}, err
		}
		sale, sErr := s.postOnlineStoreProviderSaleAndLedgerTx(ctx, q, order, lines, att.Provider, att.Reference, settledAmount, att.FeeMinor, commMinor)
		if sErr != nil {
			return MerchantOrderView{}, sErr
		}
		linkedSaleID = pgtype.Int8{Int64: sale.ID, Valid: true}
	}

	updated, err := q.FinalizeStorefrontOrderPayment(ctx, db.FinalizeStorefrontOrderPaymentParams{
		WorkspaceID:  wsID,
		ID:           order.ID,
		LinkedSaleID: linkedSaleID,
	})
	if err != nil {
		return MerchantOrderView{}, err
	}

	resolveMsg := "Payment attention resolved by merchant (accepted as paid)."
	if cleanNote != "" {
		resolveMsg += " Note: " + cleanNote
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     wsID,
		OrderID:         order.ID,
		EventType:       "payment_attention_resolved",
		ActorType:       "merchant",
		ActorUserID:     pgtype.Int8{Int64: userID, Valid: userID > 0},
		CustomerVisible: true,
		Message:         optionalPgText(resolveMsg),
	}); err != nil {
		return MerchantOrderView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MerchantOrderView{}, err
	}
	invalidateStorefrontCache("")
	return s.buildMerchantOrderDetail(ctx, updated)
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
	if order.PaymentStatus == "paid" || order.LinkedSaleID.Valid {
		return nil
	}

	// Turn hold firm via sqlc (checked error)
	if err := q.MakeOrderReservationsFirm(ctx, db.MakeOrderReservationsFirmParams{
		WorkspaceID: wsID,
		OrderID:     pgtype.Int8{Int64: order.ID, Valid: true},
	}); err != nil {
		return err
	}

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
	if err := q.UpdateSaleSource(ctx, db.UpdateSaleSourceParams{
		WorkspaceID: wsID,
		ID:          sale.ID,
		Source:      "online_store",
	}); err != nil {
		return err
	}

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

	// Update money account balance via sqlc (checked error)
	if _, err := q.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
		ID:                  moneyAccountID,
		WorkspaceID:         wsID,
		CurrentBalanceMinor: order.TotalMinor,
	}); err != nil {
		return err
	}

	// Finalize order payment status & clear reservation_expires_at via sqlc (checked error)
	if _, err := q.FinalizeStorefrontOrderPayment(ctx, db.FinalizeStorefrontOrderPaymentParams{
		WorkspaceID:  wsID,
		ID:           order.ID,
		LinkedSaleID: pgtype.Int8{Int64: sale.ID, Valid: true},
	}); err != nil {
		return err
	}

	// Create order event (checked error)
	msg := "Payment confirmed manually by merchant."
	if notes != "" {
		msg += " Note: " + notes
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     wsID,
		OrderID:         order.ID,
		EventType:       "payment_confirmed",
		ActorType:       "merchant",
		CustomerVisible: true,
		Message:         optionalPgText(msg),
	}); err != nil {
		return err
	}

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

	clearingAcc, err := q.GetMoneyAccountByName(ctx, db.GetMoneyAccountByNameParams{
		WorkspaceID: wsID,
		Lower:       clearingName,
	})
	if err != nil {
		return fmt.Errorf("clearing account not found: %w", err)
	}

	destAcc, err := q.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
		ID:          in.DestinationAccID,
		WorkspaceID: wsID,
	})
	if err != nil {
		return fmt.Errorf("destination money account not found: %w", err)
	}

	txnDate := time.Now().UTC()
	txn, err := q.CreatePayoutMoneyTransaction(ctx, db.CreatePayoutMoneyTransactionParams{
		WorkspaceID:          wsID,
		AmountMinor:          in.AmountMinor,
		Currency:             clearingAcc.Currency,
		CurrencyExponent:     clearingAcc.CurrencyExponent,
		EffectiveDate:        pgtype.Date{Time: txnDate, Valid: true},
		MoneyAccountID:       pgtype.Int8{Int64: clearingAcc.ID, Valid: true},
		DestinationAccountID: pgtype.Int8{Int64: destAcc.ID, Valid: true},
		Notes:                optionalPgText(in.Notes),
		Reference:            optionalPgText(in.Reference),
		IdempotencyKey:       optionalPgText(in.IdempotencyKey),
	})
	if err != nil {
		return err
	}

	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      wsID,
		SourceType:       "money_transaction",
		SourceID:         txn.ID,
		EntryDate:        pgtype.Date{Time: txnDate, Valid: true},
		Currency:         clearingAcc.Currency,
		CurrencyExponent: clearingAcc.CurrencyExponent,
		Description:      optionalPgText(fmt.Sprintf("Payout from %s to bank", provider)),
	})
	if err != nil {
		return err
	}

	// Debit Destination
	if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
		LedgerEntryID: entry.ID,
		WorkspaceID:   wsID,
		AccountID:     pgtype.Int8{Int64: destAcc.ID, Valid: true},
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
		AccountID:     pgtype.Int8{Int64: clearingAcc.ID, Valid: true},
		AccountClass:  "asset",
		DebitMinor:    0,
		CreditMinor:   in.AmountMinor,
		Description:   optionalPgText(fmt.Sprintf("Transfer from %s clearing", provider)),
	}); err != nil {
		return err
	}

	// Update account balances via sqlc (checked errors)
	if _, err := q.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
		ID:                  clearingAcc.ID,
		WorkspaceID:         wsID,
		CurrentBalanceMinor: -in.AmountMinor,
	}); err != nil {
		return err
	}
	if _, err := q.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
		ID:                  destAcc.ID,
		WorkspaceID:         wsID,
		CurrentBalanceMinor: in.AmountMinor,
	}); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
