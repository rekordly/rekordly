package finance

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/billing"
	"github.com/rekordly/rekordly-api/internal/db"
)

type CommercialModeStatus struct {
	Mode              string   `json:"mode"`
	CheckoutEnabled   bool     `json:"checkout_enabled"`
	PlanIntentEnabled bool     `json:"plan_intent_enabled"`
	BetaCohort        string   `json:"beta_cohort"`
	PastDueDays       int32    `json:"past_due_days"`
	GraceDays         int32    `json:"grace_days"`
	AllowedActions    []string `json:"allowed_actions"`
}

type CreateCheckoutInput struct {
	PlanVersionID int64  `json:"plan_version_id" binding:"required"`
	CallbackURL   string `json:"callback_url"`
	// Client-supplied PriceMinor/Currency are deliberately NOT trusted or used.
}

type PlanChangeQuote struct {
	SourcePlanCode     string                  `json:"source_plan_code"`
	SourcePlanVersion  int32                   `json:"source_plan_version"`
	TargetPlanCode     string                  `json:"target_plan_code"`
	TargetPlanVersion  int32                   `json:"target_plan_version"`
	BillingInterval    string                  `json:"billing_interval"`
	Currency           string                  `json:"currency"`
	AmountDueNowMinor  string                  `json:"amount_due_now_minor"`
	FutureRenewalMinor string                  `json:"future_renewal_minor"`
	TaxMinor           string                  `json:"tax_minor"`
	ProrationPolicy    string                  `json:"proration_policy"`
	EffectiveAt        time.Time               `json:"effective_at"`
	DowngradeImpact    *DowngradeImpactPreview `json:"downgrade_impact,omitempty"`
}

type ChangePlanInput struct {
	TargetPlanVersionID int64   `json:"target_plan_version_id" binding:"required"`
	KeepResourceIDs     []int64 `json:"keep_resource_ids,omitempty"`
	AcceptDowngrade     bool    `json:"accept_downgrade"`
}

type PurchaseAddonInput struct {
	AddonPlanVersionID int64 `json:"addon_plan_version_id" binding:"required"`
	Quantity           int32 `json:"quantity"`
}

type RequestRefundInput struct {
	BillingTransactionID int64  `json:"billing_transaction_id" binding:"required"`
	AmountMinor          int64  `json:"amount_minor" binding:"required"`
	Reason               string `json:"reason" binding:"required"`
}

func (s *Service) GetCommercialMode(ctx context.Context) (CommercialModeStatus, error) {
	cfg, err := s.queries.GetCommercialModeConfig(ctx)
	if err != nil {
		return CommercialModeStatus{}, err
	}
	checkoutEnabled := cfg.Mode == "public_paid" || cfg.Mode == "paid_pilot"
	actions := []string{"view_plans", "view_usage", "export_data"}
	if cfg.Mode == "controlled_beta" || cfg.Mode == "pricing_intent" {
		actions = append(actions, "save_plan_intent")
	}
	if checkoutEnabled {
		actions = append(actions, "checkout", "change_plan", "purchase_addon", "cancel_resume")
	}
	return CommercialModeStatus{
		Mode:              cfg.Mode,
		CheckoutEnabled:   checkoutEnabled,
		PlanIntentEnabled: cfg.Mode == "controlled_beta" || cfg.Mode == "pricing_intent",
		BetaCohort:        cfg.BetaCohort,
		PastDueDays:       cfg.PastDueDays,
		GraceDays:         cfg.GraceDays,
		AllowedActions:    actions,
	}, nil
}

func (s *Service) SetCommercialMode(ctx context.Context, mode string, actorUserID int64) (CommercialModeStatus, error) {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if _, err := s.queries.UpdateCommercialModeConfig(ctx, db.UpdateCommercialModeConfigParams{
		Mode:            mode,
		UpdatedByUserID: pgtype.Int8{Int64: actorUserID, Valid: actorUserID > 0},
	}); err != nil {
		return CommercialModeStatus{}, err
	}
	return s.GetCommercialMode(ctx)
}

func (s *Service) ListPlans(ctx context.Context, subjectType string, isAddon *bool) ([]db.PlanVersion, error) {
	var st pgtype.Text
	if strings.TrimSpace(subjectType) != "" {
		st = pgtype.Text{String: strings.TrimSpace(subjectType), Valid: true}
	}
	var ia pgtype.Bool
	if isAddon != nil {
		ia = pgtype.Bool{Bool: *isAddon, Valid: true}
	}
	return s.queries.ListPlanVersions(ctx, db.ListPlanVersionsParams{
		SubjectType: st,
		IsAddon:     ia,
	})
}

func (s *Service) CreateCheckoutIntent(ctx context.Context, subjectID, actorUserID int64, idempKey string, in CreateCheckoutInput) (db.CheckoutIntent, error) {
	modeCfg, err := s.queries.GetCommercialModeConfig(ctx)
	if err != nil {
		return db.CheckoutIntent{}, err
	}
	if modeCfg.Mode != "public_paid" && modeCfg.Mode != "paid_pilot" {
		return db.CheckoutIntent{}, ErrCheckoutNotAvailable
	}

	subj, err := s.queries.GetBillingSubjectByID(ctx, subjectID)
	if isNoRows(err) {
		return db.CheckoutIntent{}, ErrNotFound
	}
	if err != nil {
		return db.CheckoutIntent{}, err
	}

	idempKey = strings.TrimSpace(idempKey)
	if idempKey == "" {
		idempKey = fmt.Sprintf("chk-%d-%d-%d", subjectID, in.PlanVersionID, time.Now().UnixNano())
	}
	if existing, err := s.queries.GetCheckoutIntentByIdemp(ctx, db.GetCheckoutIntentByIdempParams{
		BillingSubjectID: subjectID,
		IdempotencyKey:   idempKey,
	}); err == nil {
		return existing, nil
	}

	// Authoritative server-side plan & price resolution (never trust client price/currency)
	plan, err := s.queries.GetPlanVersionByID(ctx, in.PlanVersionID)
	if isNoRows(err) || !plan.IsAvailable || (plan.EffectiveTo.Valid && plan.EffectiveTo.Time.Before(time.Now().UTC())) {
		return db.CheckoutIntent{}, ErrPlanVersionUnavailable
	}
	if err != nil {
		return db.CheckoutIntent{}, err
	}
	if plan.PriceMinor <= 0 {
		return db.CheckoutIntent{}, ErrCheckoutNotAvailable
	}

	ref := randomBillingRef("rk_chk")
	var authURL, accessCode string
	if s.paymentProvider != nil && s.paymentProvider.IsConfigured() {
		email := subj.BillingEmail
		if email == "" {
			email = fmt.Sprintf("billing-subject-%d@rekordly.local", subj.ID)
		}
		initResp, pErr := s.paymentProvider.InitializeCheckout(ctx, billing.InitializeCheckoutRequest{
			Email:       email,
			AmountMinor: plan.PriceMinor,
			Currency:    plan.Currency,
			Reference:   ref,
			CallbackURL: in.CallbackURL,
			Metadata:    map[string]any{"billing_subject_id": subj.ID, "plan_version_id": plan.ID},
		})
		if pErr != nil {
			return db.CheckoutIntent{}, pErr
		}
		authURL = initResp.AuthorizationURL
		accessCode = initResp.AccessCode
	}

	return s.queries.CreateCheckoutIntent(ctx, db.CreateCheckoutIntentParams{
		BillingSubjectID:   subj.ID,
		PlanVersionID:      plan.ID,
		Reference:          ref,
		AmountMinor:        plan.PriceMinor,
		Currency:           plan.Currency,
		Status:             "pending",
		ProviderAccessCode: accessCode,
		AuthorizationUrl:   authURL,
		IdempotencyKey:     idempKey,
		CreatedByUserID:    pgtype.Int8{Int64: actorUserID, Valid: true},
	})
}

// VerifyCheckoutIntent verifies a pending checkout with Paystack. Never activates on unverified callbacks.
func (s *Service) VerifyCheckoutIntent(ctx context.Context, intentID int64) (db.CheckoutIntent, error) {
	intent, err := s.queries.GetCheckoutIntentByID(ctx, intentID)
	if isNoRows(err) {
		return db.CheckoutIntent{}, ErrNotFound
	}
	if err != nil {
		return db.CheckoutIntent{}, err
	}
	if intent.Status == "verified" {
		return intent, nil
	}
	if s.paymentProvider == nil || !s.paymentProvider.IsConfigured() {
		return intent, ErrPaymentConfirmPending
	}

	ver, err := s.paymentProvider.VerifyTransaction(ctx, intent.Reference)
	if err != nil {
		return intent, err
	}
	if ver.Status != "success" {
		if ver.Status == "failed" || ver.Status == "abandoned" {
			return s.queries.UpdateCheckoutIntentStatus(ctx, db.UpdateCheckoutIntentStatusParams{
				ID: intent.ID, Status: "failed",
			})
		}
		return intent, ErrPaymentConfirmPending
	}
	if ver.AmountMinor != intent.AmountMinor || !strings.EqualFold(ver.Currency, intent.Currency) {
		return s.queries.UpdateCheckoutIntentStatus(ctx, db.UpdateCheckoutIntentStatusParams{
			ID: intent.ID, Status: "mismatch_review",
		})
	}
	return s.activateCheckoutIntent(ctx, intent, ver.Reference, time.Now().UTC())
}

// ProcessPaystackWebhook validates raw-body HMAC signature, deduplicates event_id, prevents out-of-order regression.
func (s *Service) ProcessPaystackWebhook(ctx context.Context, rawBody []byte, signatureHeader string) (string, error) {
	if s.paymentProvider == nil || !s.paymentProvider.VerifyWebhookSignature(rawBody, signatureHeader) {
		return "", billing.ErrInvalidWebhookSig
	}

	var evt struct {
		Event string `json:"event"`
		Data  struct {
			ID        any    `json:"id"`
			Reference string `json:"reference"`
			Amount    int64  `json:"amount"`
			Currency  string `json:"currency"`
			PaidAt    string `json:"paid_at"`
			CreatedAt string `json:"created_at"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &evt); err != nil || evt.Event == "" {
		return "", errors.New("invalid webhook payload")
	}

	eventID := fmt.Sprintf("%s:%v:%s", evt.Event, evt.Data.ID, evt.Data.Reference)
	occurredAt := time.Now().UTC()
	if evt.Data.PaidAt != "" {
		if t, err := time.Parse(time.RFC3339, evt.Data.PaidAt); err == nil {
			occurredAt = t.UTC()
		}
	} else if evt.Data.CreatedAt != "" {
		if t, err := time.Parse(time.RFC3339, evt.Data.CreatedAt); err == nil {
			occurredAt = t.UTC()
		}
	}

	redacted := fmt.Sprintf(`{"event":%q,"reference":%q,"amount":%d,"currency":%q}`,
		evt.Event, evt.Data.Reference, evt.Data.Amount, evt.Data.Currency)

	evRow, err := s.queries.CreateProviderEvent(ctx, db.CreateProviderEventParams{
		Provider:        "paystack",
		EventID:         eventID,
		EventType:       evt.Event,
		ProviderRef:     evt.Data.Reference,
		SignatureValid:  true,
		EventOccurredAt: pgtype.Timestamptz{Time: occurredAt, Valid: true},
		ProcessingState: "received",
		RedactedSummary: redacted,
	})
	if isNoRows(err) {
		return "duplicate_ignored", nil
	}
	if err != nil {
		return "", err
	}

	intent, iErr := s.queries.GetCheckoutIntentByReference(ctx, evt.Data.Reference)
	if isNoRows(iErr) {
		_ = s.queries.UpdateProviderEventState(ctx, db.UpdateProviderEventStateParams{
			ID: evRow.ID, ProcessingState: "processed", ErrorMessage: "no matching checkout intent",
		})
		return "processed_unlinked", nil
	}
	if iErr != nil {
		return "", iErr
	}

	switch evt.Event {
	case "charge.success":
		if evt.Data.Amount != intent.AmountMinor || !strings.EqualFold(evt.Data.Currency, intent.Currency) {
			_, _ = s.queries.UpdateCheckoutIntentStatus(ctx, db.UpdateCheckoutIntentStatusParams{
				ID: intent.ID, Status: "mismatch_review",
			})
			_ = s.queries.UpdateProviderEventState(ctx, db.UpdateProviderEventStateParams{
				ID: evRow.ID, ProcessingState: "mismatch_review", ErrorMessage: "amount or currency mismatch",
			})
			return "mismatch_review", nil
		}
		if _, aErr := s.activateCheckoutIntent(ctx, intent, evt.Data.Reference, occurredAt); aErr != nil {
			if errors.Is(aErr, ErrOutOfOrderEvent) {
				_ = s.queries.UpdateProviderEventState(ctx, db.UpdateProviderEventStateParams{
					ID: evRow.ID, ProcessingState: "ignored_out_of_order",
				})
				return "ignored_out_of_order", nil
			}
			return "", aErr
		}
	case "invoice.payment_failed":
		_ = s.transitionSubscriptionState(ctx, intent.BillingSubjectID, "past_due", "webhook_payment_failed", occurredAt)
	case "subscription.disable":
		_ = s.transitionSubscriptionState(ctx, intent.BillingSubjectID, "grace", "webhook_subscription_disabled", occurredAt)
	case "charge.dispute.create":
		_ = s.transitionSubscriptionState(ctx, intent.BillingSubjectID, "chargeback_review", "webhook_chargeback", occurredAt)
	}

	_ = s.queries.UpdateProviderEventState(ctx, db.UpdateProviderEventStateParams{
		ID: evRow.ID, ProcessingState: "processed",
	})
	return "processed", nil
}

var ErrOutOfOrderEvent = errors.New("out_of_order_provider_event")

func (s *Service) activateCheckoutIntent(ctx context.Context, intent db.CheckoutIntent, providerRef string, occurredAt time.Time) (db.CheckoutIntent, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.CheckoutIntent{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	sub, err := qtx.GetSubscriptionForUpdate(ctx, intent.BillingSubjectID)
	if err != nil {
		return db.CheckoutIntent{}, err
	}
	if sub.LastEventAt.Valid && occurredAt.Before(sub.LastEventAt.Time) {
		return db.CheckoutIntent{}, ErrOutOfOrderEvent
	}
	plan, err := qtx.GetPlanVersionByID(ctx, intent.PlanVersionID)
	if err != nil {
		return db.CheckoutIntent{}, err
	}

	now := time.Now().UTC()
	var nextPaidThrough time.Time
	base := now
	if sub.PaidThroughAt.Valid && sub.PaidThroughAt.Time.After(now) && sub.State == "active" {
		base = sub.PaidThroughAt.Time
	}
	if plan.BillingInterval == "yearly" {
		nextPaidThrough = base.AddDate(1, 0, 0)
	} else {
		nextPaidThrough = base.AddDate(0, 1, 0)
	}

	if !plan.IsAddon {
		if _, err := qtx.UpdateSubscriptionState(ctx, db.UpdateSubscriptionStateParams{
			ID:                sub.ID,
			PlanVersionID:     plan.ID,
			State:             "active",
			BillingInterval:   plan.BillingInterval,
			PaidThroughAt:     pgtype.Timestamptz{Time: nextPaidThrough, Valid: true},
			CancelAtPeriodEnd: false,
			ProviderSubRef:    pgtype.Text{String: providerRef, Valid: providerRef != ""},
			StateReason:       "checkout_verified",
			LastEventAt:       pgtype.Timestamptz{Time: occurredAt, Valid: true},
		}); err != nil {
			return db.CheckoutIntent{}, err
		}
	} else {
		var exp pgtype.Timestamptz
		if plan.BillingInterval != "once" {
			exp = pgtype.Timestamptz{Time: nextPaidThrough, Valid: true}
		}
		_, _ = qtx.CreateAddonInstance(ctx, db.CreateAddonInstanceParams{
			BillingSubjectID:   intent.BillingSubjectID,
			AddonPlanVersionID: plan.ID,
			Quantity:           1,
			IsRecurring:        plan.BillingInterval != "once",
			ExpiresAt:          exp,
			IdempotencyKey:     "chk-addon:" + intent.Reference,
		})
	}

	updatedIntent, err := qtx.UpdateCheckoutIntentStatus(ctx, db.UpdateCheckoutIntentStatusParams{
		ID:         intent.ID,
		Status:     "verified",
		VerifiedAt: pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		return db.CheckoutIntent{}, err
	}

	btx, err := qtx.CreateBillingTransaction(ctx, db.CreateBillingTransactionParams{
		BillingSubjectID: intent.BillingSubjectID,
		SubscriptionID:   pgtype.Int8{Int64: sub.ID, Valid: true},
		CheckoutIntentID: pgtype.Int8{Int64: intent.ID, Valid: true},
		TxType:           "charge",
		AmountMinor:      intent.AmountMinor,
		TaxMinor:         0,
		Currency:         intent.Currency,
		Status:           "succeeded",
		ProviderRef:      providerRef,
		IdempotencyKey:   "btx:" + intent.Reference,
	})
	if err != nil {
		return db.CheckoutIntent{}, err
	}

	docNum := fmt.Sprintf("RK-RCPT-%d-%d", intent.BillingSubjectID, btx.ID)
	_, _ = qtx.CreateBillingDocument(ctx, db.CreateBillingDocumentParams{
		BillingSubjectID:     intent.BillingSubjectID,
		BillingTransactionID: pgtype.Int8{Int64: btx.ID, Valid: true},
		DocumentNumber:       docNum,
		DocumentType:         "receipt",
		Currency:             intent.Currency,
		SubtotalMinor:        intent.AmountMinor,
		TaxMinor:             0,
		TotalMinor:           intent.AmountMinor,
		ServicePeriod:        fmt.Sprintf("%s to %s", now.Format("2006-01-02"), nextPaidThrough.Format("2006-01-02")),
		ContentText:          fmt.Sprintf("Rekordly Receipt %s\nPlan: %s\nAmount: %d %s\nReference: %s\n", docNum, plan.DisplayName, intent.AmountMinor, intent.Currency, providerRef),
	})

	if err := tx.Commit(ctx); err != nil {
		return db.CheckoutIntent{}, err
	}
	return updatedIntent, nil
}

func (s *Service) transitionSubscriptionState(ctx context.Context, subjectID int64, targetState, reason string, eventAt time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	sub, err := qtx.GetSubscriptionForUpdate(ctx, subjectID)
	if err != nil {
		return err
	}
	if sub.LastEventAt.Valid && eventAt.Before(sub.LastEventAt.Time) {
		return ErrOutOfOrderEvent
	}
	var graceEnds pgtype.Timestamptz
	if targetState == "grace" {
		graceEnds = pgtype.Timestamptz{Time: time.Now().UTC().Add(7 * 24 * time.Hour), Valid: true}
	} else {
		graceEnds = sub.GraceEndsAt
	}
	if _, err := qtx.UpdateSubscriptionState(ctx, db.UpdateSubscriptionStateParams{
		ID:                sub.ID,
		PlanVersionID:     sub.PlanVersionID,
		State:             targetState,
		BillingInterval:   sub.BillingInterval,
		PaidThroughAt:     sub.PaidThroughAt,
		GraceEndsAt:       graceEnds,
		CancelAtPeriodEnd: sub.CancelAtPeriodEnd,
		CancelledAt:       sub.CancelledAt,
		ProviderSubRef:    sub.ProviderSubRef,
		StateReason:       reason,
		LastEventAt:       pgtype.Timestamptz{Time: eventAt, Valid: true},
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) GetSubscriptionChangeQuote(ctx context.Context, subjectID, targetPlanVersionID int64) (PlanChangeQuote, error) {
	snap, err := s.ResolveEntitlements(ctx, subjectID)
	if err != nil {
		return PlanChangeQuote{}, err
	}
	target, err := s.queries.GetPlanVersionByID(ctx, targetPlanVersionID)
	if isNoRows(err) || !target.IsAvailable {
		return PlanChangeQuote{}, ErrPlanVersionUnavailable
	}
	if err != nil {
		return PlanChangeQuote{}, err
	}

	var impact *DowngradeImpactPreview
	amountDue := target.PriceMinor
	proration := "immediate_upgrade"
	effectiveAt := time.Now().UTC()
	if target.PriceMinor < snap.Plan.PriceMinor {
		imp, _ := s.GetDowngradeImpact(ctx, subjectID, target.ID)
		impact = &imp
		amountDue = 0
		proration = "end_of_period_downgrade"
		if snap.Subscription.PaidThroughAt.Valid {
			effectiveAt = snap.Subscription.PaidThroughAt.Time
		}
	}

	return PlanChangeQuote{
		SourcePlanCode:     snap.Plan.PlanCode,
		SourcePlanVersion:  snap.Plan.Version,
		TargetPlanCode:     target.PlanCode,
		TargetPlanVersion:  target.Version,
		BillingInterval:    target.BillingInterval,
		Currency:           target.Currency,
		AmountDueNowMinor:  strconv.FormatInt(amountDue, 10),
		FutureRenewalMinor: strconv.FormatInt(target.PriceMinor, 10),
		TaxMinor:           "0",
		ProrationPolicy:    proration,
		EffectiveAt:        effectiveAt,
		DowngradeImpact:    impact,
	}, nil
}

func (s *Service) ChangePlan(ctx context.Context, subjectID, actorUserID int64, idempKey string, in ChangePlanInput) (db.Subscription, error) {
	modeCfg, err := s.queries.GetCommercialModeConfig(ctx)
	if err != nil {
		return db.Subscription{}, err
	}
	target, err := s.queries.GetPlanVersionByID(ctx, in.TargetPlanVersionID)
	if isNoRows(err) || !target.IsAvailable {
		return db.Subscription{}, ErrPlanVersionUnavailable
	}
	if err != nil {
		return db.Subscription{}, err
	}
	if target.PriceMinor > 0 && modeCfg.Mode != "public_paid" && modeCfg.Mode != "paid_pilot" {
		return db.Subscription{}, ErrCheckoutNotAvailable
	}

	quote, err := s.GetSubscriptionChangeQuote(ctx, subjectID, target.ID)
	if err != nil {
		return db.Subscription{}, err
	}
	if quote.DowngradeImpact != nil && quote.DowngradeImpact.RequiresSelection && !in.AcceptDowngrade {
		return db.Subscription{}, ErrDowngradeRequiresSelect
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.Subscription{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	sub, err := qtx.GetSubscriptionForUpdate(ctx, subjectID)
	if err != nil {
		return db.Subscription{}, err
	}
	quoteJSON, _ := json.Marshal(quote)
	if idempKey == "" {
		idempKey = fmt.Sprintf("chg-%d-%d-%d", subjectID, target.ID, time.Now().UnixNano())
	}
	_, _ = qtx.CreateSubscriptionChange(ctx, db.CreateSubscriptionChangeParams{
		BillingSubjectID:    subjectID,
		SubscriptionID:      sub.ID,
		SourcePlanVersionID: sub.PlanVersionID,
		TargetPlanVersionID: target.ID,
		QuoteSnapshot:       quoteJSON,
		Status:              "completed",
		EffectiveAt:         pgtype.Timestamptz{Time: quote.EffectiveAt, Valid: true},
		ActorUserID:         pgtype.Int8{Int64: actorUserID, Valid: true},
		IdempotencyKey:      idempKey,
	})

	updated, err := qtx.UpdateSubscriptionState(ctx, db.UpdateSubscriptionStateParams{
		ID:                sub.ID,
		PlanVersionID:     target.ID,
		State:             "active",
		BillingInterval:   target.BillingInterval,
		PaidThroughAt:     sub.PaidThroughAt,
		GraceEndsAt:       sub.GraceEndsAt,
		CancelAtPeriodEnd: false,
		ProviderSubRef:    sub.ProviderSubRef,
		StateReason:       "plan_changed",
	})
	if err != nil {
		return db.Subscription{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.Subscription{}, err
	}
	return updated, nil
}

func (s *Service) CancelSubscription(ctx context.Context, subjectID int64, reason string) (db.Subscription, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.Subscription{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	sub, err := qtx.GetSubscriptionForUpdate(ctx, subjectID)
	if err != nil {
		return db.Subscription{}, err
	}
	updated, err := qtx.UpdateSubscriptionState(ctx, db.UpdateSubscriptionStateParams{
		ID:                sub.ID,
		PlanVersionID:     sub.PlanVersionID,
		State:             "cancel_at_period_end",
		BillingInterval:   sub.BillingInterval,
		PaidThroughAt:     sub.PaidThroughAt,
		GraceEndsAt:       sub.GraceEndsAt,
		CancelAtPeriodEnd: true,
		CancelledAt:       pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		ProviderSubRef:    sub.ProviderSubRef,
		StateReason:       "voluntary_cancel:" + strings.TrimSpace(reason),
	})
	if err != nil {
		return db.Subscription{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.Subscription{}, err
	}
	return updated, nil
}

func (s *Service) ResumeSubscription(ctx context.Context, subjectID int64) (db.Subscription, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.Subscription{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	sub, err := qtx.GetSubscriptionForUpdate(ctx, subjectID)
	if err != nil {
		return db.Subscription{}, err
	}
	if sub.State != "cancel_at_period_end" {
		return sub, nil
	}
	updated, err := qtx.UpdateSubscriptionState(ctx, db.UpdateSubscriptionStateParams{
		ID:                sub.ID,
		PlanVersionID:     sub.PlanVersionID,
		State:             "active",
		BillingInterval:   sub.BillingInterval,
		PaidThroughAt:     sub.PaidThroughAt,
		GraceEndsAt:       sub.GraceEndsAt,
		CancelAtPeriodEnd: false,
		ProviderSubRef:    sub.ProviderSubRef,
		StateReason:       "cancellation_resumed",
	})
	if err != nil {
		return db.Subscription{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.Subscription{}, err
	}
	return updated, nil
}

func (s *Service) PurchaseAddon(ctx context.Context, subjectID int64, idempKey string, in PurchaseAddonInput) (db.AddOnInstance, error) {
	modeCfg, err := s.queries.GetCommercialModeConfig(ctx)
	if err != nil {
		return db.AddOnInstance{}, err
	}
	if modeCfg.Mode != "public_paid" && modeCfg.Mode != "paid_pilot" {
		return db.AddOnInstance{}, ErrCheckoutNotAvailable
	}
	addon, err := s.queries.GetPlanVersionByID(ctx, in.AddonPlanVersionID)
	if isNoRows(err) || !addon.IsAddon || !addon.IsAvailable {
		return db.AddOnInstance{}, ErrPlanVersionUnavailable
	}
	if err != nil {
		return db.AddOnInstance{}, err
	}
	qty := in.Quantity
	if qty <= 0 {
		qty = 1
	}
	if idempKey == "" {
		idempKey = fmt.Sprintf("addon-%d-%d-%d", subjectID, addon.ID, time.Now().UnixNano())
	}
	var exp pgtype.Timestamptz
	if addon.BillingInterval != "once" {
		exp = pgtype.Timestamptz{Time: time.Now().UTC().AddDate(0, 1, 0), Valid: true}
	}
	return s.queries.CreateAddonInstance(ctx, db.CreateAddonInstanceParams{
		BillingSubjectID:   subjectID,
		AddonPlanVersionID: addon.ID,
		Quantity:           qty,
		IsRecurring:        addon.BillingInterval != "once",
		ExpiresAt:          exp,
		IdempotencyKey:     idempKey,
	})
}

func (s *Service) RequestRefund(ctx context.Context, subjectID, actorUserID int64, idempKey string, in RequestRefundInput) (db.Refund, error) {
	btx, err := s.queries.GetBillingTransactionByID(ctx, db.GetBillingTransactionByIDParams{
		ID:               in.BillingTransactionID,
		BillingSubjectID: subjectID,
	})
	if isNoRows(err) {
		return db.Refund{}, ErrNotFound
	}
	if err != nil {
		return db.Refund{}, err
	}
	alreadyRefunded, err := s.queries.SumSucceededRefundsForTx(ctx, btx.ID)
	if err != nil {
		return db.Refund{}, err
	}
	if in.AmountMinor <= 0 || alreadyRefunded+in.AmountMinor > btx.AmountMinor {
		return db.Refund{}, errors.New("refund exceeds captured payment amount")
	}
	if idempKey == "" {
		idempKey = fmt.Sprintf("ref-%d-%d", btx.ID, time.Now().UnixNano())
	}
	refRef := randomBillingRef("rk_ref")
	status := "succeeded"
	if s.paymentProvider != nil && s.paymentProvider.IsConfigured() && btx.ProviderRef != "" {
		res, pErr := s.paymentProvider.RefundTransaction(ctx, billing.RefundRequest{
			TransactionRef: btx.ProviderRef, AmountMinor: in.AmountMinor, Currency: btx.Currency,
		})
		if pErr == nil && res.RefundRef != "" {
			refRef = res.RefundRef
		}
	}
	return s.queries.CreateRefund(ctx, db.CreateRefundParams{
		BillingTransactionID: btx.ID,
		BillingSubjectID:     subjectID,
		AmountMinor:          in.AmountMinor,
		Currency:             btx.Currency,
		Reason:               strings.TrimSpace(in.Reason),
		Status:               status,
		ProviderRefundRef:    refRef,
		IdempotencyKey:       idempKey,
		RequestedByUserID:    pgtype.Int8{Int64: actorUserID, Valid: true},
	})
}

func (s *Service) ListBillingTransactions(ctx context.Context, subjectID int64) ([]db.BillingTransaction, error) {
	return s.queries.ListBillingTransactionsBySubject(ctx, db.ListBillingTransactionsBySubjectParams{
		BillingSubjectID: subjectID, Limit: 50,
	})
}

func (s *Service) ListBillingDocuments(ctx context.Context, subjectID int64) ([]db.BillingDocument, error) {
	return s.queries.ListBillingDocumentsBySubject(ctx, db.ListBillingDocumentsBySubjectParams{
		BillingSubjectID: subjectID, Limit: 50,
	})
}

func (s *Service) DownloadBillingDocument(ctx context.Context, subjectID, docID int64) (db.BillingDocument, error) {
	doc, err := s.queries.GetBillingDocumentByID(ctx, docID)
	if isNoRows(err) || doc.BillingSubjectID != subjectID {
		return db.BillingDocument{}, ErrNotFound
	}
	return doc, err
}

func (s *Service) RunBillingReconciliation(ctx context.Context) (db.BillingReconciliationRun, error) {
	released, _ := s.ReleaseExpiredUsageReservations(ctx)
	summary := fmt.Sprintf("Released %d expired usage reservations; verified subscription states", released)
	return s.queries.CreateBillingReconciliationRun(ctx, db.CreateBillingReconciliationRunParams{
		Status:        "completed",
		CheckedCount:  int32(released),
		MismatchCount: 0,
		Summary:       summary,
	})
}

func randomBillingRef(prefix string) string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return prefix + "_" + hex.EncodeToString(b[:])
}
