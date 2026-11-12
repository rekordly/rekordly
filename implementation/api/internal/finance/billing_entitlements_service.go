package finance

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

// Stable Blueprint 13 error codes
var (
	ErrFeatureNotIncluded        = errors.New("FEATURE_NOT_INCLUDED")
	ErrPlanLimitReached          = errors.New("PLAN_LIMIT_REACHED")
	ErrEntitlementStale          = errors.New("ENTITLEMENT_STALE")
	ErrSubscriptionPastDue       = errors.New("SUBSCRIPTION_PAST_DUE")
	ErrCheckoutNotAvailable      = errors.New("CHECKOUT_NOT_AVAILABLE")
	ErrPlanVersionUnavailable    = errors.New("PLAN_VERSION_UNAVAILABLE")
	ErrBillingPermissionRequired = errors.New("BILLING_PERMISSION_REQUIRED")
	ErrPaymentConfirmPending     = errors.New("PAYMENT_CONFIRMATION_PENDING")
	ErrDowngradeRequiresSelect   = errors.New("DOWNGRADE_REQUIRES_SELECTION")
)

type FeatureKey string

const (
	FeatRecordsConfirmedMonthly FeatureKey = "records.confirmed.monthly"
	FeatHistoryInteractiveMonth FeatureKey = "history.interactive.months"
	FeatAccountsActiveMax       FeatureKey = "accounts.active.max"
	FeatCategoriesCustomMax     FeatureKey = "categories.custom.active.max"
	FeatBudgetsActiveMax        FeatureKey = "budgets.active.max"
	FeatAttachmentsStorageBytes FeatureKey = "attachments.storage.bytes"
	FeatAIDraftMonthly          FeatureKey = "ai.draft.monthly"
	FeatAIDraftPackBalance      FeatureKey = "ai.draft.pack_balance"
	FeatCSVImportEnabled        FeatureKey = "csv.import.enabled"
	FeatExportsFullCooldownDays FeatureKey = "exports.full.cooldown_days"
	FeatOfflineMode             FeatureKey = "offline.mode"
	FeatReportsPersonalAdv      FeatureKey = "reports.personal.advanced"

	FeatPersonalLoans       FeatureKey = "personal.loans.enabled"
	FeatPersonalAssets      FeatureKey = "personal.assets.enabled"
	FeatPersonalInvestments FeatureKey = "personal.investments.enabled"
	FeatPersonalInsights    FeatureKey = "personal.insights.enabled"
	FeatPersonalAlerts      FeatureKey = "personal.alerts.enabled"
	FeatPersonalMixedSplit  FeatureKey = "personal.mixed_split.enabled"

	FeatBusinessOwnedMax        FeatureKey = "business.owned.max"
	FeatBusinessStaffMax        FeatureKey = "business.staff.active.max"
	FeatBusinessAccountantMax   FeatureKey = "business.accountant.active.max"
	FeatBusinessOutletsMax      FeatureKey = "business.outlets.active.max"
	FeatBusinessInventory       FeatureKey = "business.inventory.enabled"
	FeatBusinessProcurement     FeatureKey = "business.procurement.enabled"
	FeatBusinessReportsFin      FeatureKey = "business.reports.financial"
	FeatBusinessTaxReadiness    FeatureKey = "business.tax_readiness.enabled"
	FeatBusinessStorefront      FeatureKey = "business.storefront.enabled"
	FeatBusinessStorefrontMax   FeatureKey = "business.storefront.active.max"
	FeatBusinessCustomDomainMax FeatureKey = "business.custom_domain.active.max"
	FeatBusinessAIDocDraft      FeatureKey = "business.ai_document_draft.enabled"
)

type EntitlementDecision struct {
	Allowed         bool       `json:"allowed"`
	Feature         FeatureKey `json:"feature"`
	ReasonCode      string     `json:"reason_code"`
	PlanCode        string     `json:"plan_code"`
	Current         string     `json:"current"`
	Limit           string     `json:"limit"`
	ResetAt         *time.Time `json:"reset_at"`
	GraceEndsAt     *time.Time `json:"grace_ends_at"`
	UpgradeOptions  []string   `json:"upgrade_options"`
	DecisionVersion string     `json:"decision_version"`
}

type ResolvedEntitlement struct {
	FeatureKey  FeatureKey `json:"feature_key"`
	GrantType   string     `json:"grant_type"`
	BoolValue   bool       `json:"bool_value"`
	IntValue    int64      `json:"int_value"`
	TextValue   string     `json:"text_value"`
	PeriodModel string     `json:"period_model"`
	Source      string     `json:"source"`
}

type SubjectEntitlementSnapshot struct {
	Subject             db.BillingSubject                  `json:"subject"`
	Subscription        db.Subscription                    `json:"subscription"`
	Plan                db.PlanVersion                     `json:"plan"`
	CommercialMode      string                             `json:"commercial_mode"`
	EntitlementRevision int64                              `json:"entitlement_revision"`
	Addons              []db.ListActiveAddonsBySubjectRow  `json:"addons"`
	Features            map[FeatureKey]ResolvedEntitlement `json:"features"`
}

type UsageMeter struct {
	FeatureKey       FeatureKey `json:"feature_key"`
	Consumed         int64      `json:"consumed"`
	Reserved         int64      `json:"reserved"`
	ManualAdjustment int64      `json:"manual_adjustment"`
	Limit            int64      `json:"limit"`
	PercentUsed      int        `json:"percent_used"`
	WarningLevel     string     `json:"warning_level"` // ok, warn_70, warn_90, reached_100
	PeriodStart      time.Time  `json:"period_start"`
	PeriodEnd        time.Time  `json:"period_end"`
}

type DowngradeExcessItem struct {
	ResourceType string `json:"resource_type"`
	CurrentCount int64  `json:"current_count"`
	TargetLimit  int64  `json:"target_limit"`
	ExcessCount  int64  `json:"excess_count"`
	Preservation string `json:"preservation"`
}

type DowngradeImpactPreview struct {
	SubjectID          int64                 `json:"subject_id"`
	CurrentPlanCode    string                `json:"current_plan_code"`
	TargetPlanCode     string                `json:"target_plan_code"`
	TargetPlanVersion  int32                 `json:"target_plan_version"`
	RequiresSelection  bool                  `json:"requires_selection"`
	ExcessItems        []DowngradeExcessItem `json:"excess_items"`
	RestrictedFeatures []string              `json:"restricted_features"`
	PreservedGuarantee string                `json:"preserved_guarantee"`
}

// ResolveSubjectForWorkspace ensures a workspace has a billing_subject and an initial subscription.
func (s *Service) ResolveSubjectForWorkspace(ctx context.Context, workspaceID int64) (db.BillingSubject, db.Subscription, error) {
	subj, err := s.queries.GetBillingSubjectByWorkspace(ctx, workspaceID)
	if isNoRows(err) {
		var wsKind, wsName string
		var ownerID int64
		if qErr := s.pool.QueryRow(ctx, `SELECT kind, name, owner_user_id FROM workspaces WHERE id = $1`, workspaceID).Scan(&wsKind, &wsName, &ownerID); qErr != nil {
			return db.BillingSubject{}, db.Subscription{}, qErr
		}
		if wsKind != "personal" && wsKind != "business" {
			wsKind = "personal"
		}
		var email string
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(normalized_identifier, '') FROM auth_identities WHERE user_id = $1 AND provider = 'email' AND status = 'active' LIMIT 1`, ownerID).Scan(&email)
		subj, err = s.queries.UpsertBillingSubject(ctx, db.UpsertBillingSubjectParams{
			SubjectType:  wsKind,
			WorkspaceID:  workspaceID,
			OwnerUserID:  ownerID,
			BillingName:  wsName,
			BillingEmail: email,
		})
		if err != nil {
			return db.BillingSubject{}, db.Subscription{}, err
		}
	} else if err != nil {
		return db.BillingSubject{}, db.Subscription{}, err
	}

	sub, err := s.queries.GetSubscriptionBySubject(ctx, subj.ID)
	if isNoRows(err) {
		defaultCode := "free"
		if subj.SubjectType == "business" {
			defaultCode = "business_monthly"
		}
		pv, pErr := s.queries.GetPlanVersionByCodeAndVersion(ctx, db.GetPlanVersionByCodeAndVersionParams{
			PlanCode: defaultCode,
			Version:  1,
		})
		if pErr != nil {
			return db.BillingSubject{}, db.Subscription{}, pErr
		}
		sub, err = s.queries.CreateSubscription(ctx, db.CreateSubscriptionParams{
			BillingSubjectID: subj.ID,
			PlanVersionID:    pv.ID,
			State:            "active",
			BillingInterval:  pv.BillingInterval,
			PaidThroughAt:    pgtype.Timestamptz{Time: time.Now().UTC().Add(30 * 24 * time.Hour), Valid: true},
			StateReason:      "initial_workspace_grant",
		})
		if err != nil {
			return db.BillingSubject{}, db.Subscription{}, err
		}
	} else if err != nil {
		return db.BillingSubject{}, db.Subscription{}, err
	}
	return subj, sub, nil
}

func (s *Service) ResolveEntitlements(ctx context.Context, subjectID int64) (SubjectEntitlementSnapshot, error) {
	subj, err := s.queries.GetBillingSubjectByID(ctx, subjectID)
	if isNoRows(err) {
		return SubjectEntitlementSnapshot{}, ErrNotFound
	}
	if err != nil {
		return SubjectEntitlementSnapshot{}, err
	}
	sub, err := s.queries.GetSubscriptionBySubject(ctx, subj.ID)
	if isNoRows(err) {
		_, sub, err = s.ResolveSubjectForWorkspace(ctx, subj.WorkspaceID)
	}
	if err != nil {
		return SubjectEntitlementSnapshot{}, err
	}
	plan, err := s.queries.GetPlanVersionByID(ctx, sub.PlanVersionID)
	if err != nil {
		return SubjectEntitlementSnapshot{}, err
	}
	modeCfg, err := s.queries.GetCommercialModeConfig(ctx)
	if err != nil {
		return SubjectEntitlementSnapshot{}, err
	}

	defs, err := s.queries.ListPlanEntitlementDefinitions(ctx, plan.ID)
	if err != nil {
		return SubjectEntitlementSnapshot{}, err
	}
	features := make(map[FeatureKey]ResolvedEntitlement, len(defs))
	for _, d := range defs {
		fk := FeatureKey(d.FeatureKey)
		features[fk] = ResolvedEntitlement{
			FeatureKey:  fk,
			GrantType:   d.GrantType,
			BoolValue:   d.BoolValue.Bool,
			IntValue:    d.IntValue.Int64,
			TextValue:   d.TextValue.String,
			PeriodModel: d.PeriodModel,
			Source:      fmt.Sprintf("plan:%s:v%d", plan.PlanCode, plan.Version),
		}
	}

	// Apply active add-ons additively
	addons, _ := s.queries.ListActiveAddonsBySubject(ctx, subj.ID)
	for _, ad := range addons {
		qty := int64(ad.Quantity)
		switch ad.AddonType {
		case "extra_staff":
			f := features[FeatBusinessStaffMax]
			f.IntValue += qty
			features[FeatBusinessStaffMax] = f
		case "extra_outlet":
			f := features[FeatBusinessOutletsMax]
			f.IntValue += qty
			features[FeatBusinessOutletsMax] = f
		case "additional_business":
			f := features[FeatBusinessOwnedMax]
			f.IntValue += qty
			features[FeatBusinessOwnedMax] = f
		case "custom_domain":
			f := features[FeatBusinessCustomDomainMax]
			f.IntValue += qty
			features[FeatBusinessCustomDomainMax] = f
		case "ai_credit_pack":
			f := features[FeatAIDraftPackBalance]
			f.IntValue += 100 * qty
			features[FeatAIDraftPackBalance] = f
		case "storage_pack":
			f := features[FeatAttachmentsStorageBytes]
			f.IntValue += 10 * 1024 * 1024 * 1024 * qty
			features[FeatAttachmentsStorageBytes] = f
		}
	}

	// Apply controlled_beta bounded grant if in controlled_beta and subscription is active
	if modeCfg.Mode == "controlled_beta" && sub.State == "active" && subj.SubjectType == "personal" {
		// Beta participants on personal workspaces receive bounded Personal Plus capabilities
		for _, fk := range []FeatureKey{FeatCSVImportEnabled, FeatReportsPersonalAdv, FeatPersonalLoans, FeatPersonalAssets, FeatPersonalInvestments, FeatPersonalInsights, FeatPersonalAlerts, FeatPersonalMixedSplit} {
			f := features[fk]
			f.FeatureKey = fk
			f.GrantType = "boolean"
			f.BoolValue = true
			f.Source = "controlled_beta:" + modeCfg.BetaCohort
			features[fk] = f
		}
	}

	// Apply explicit entitlement overrides (support remediation, founding offers, incident overrides)
	overrides, _ := s.queries.ListActiveEntitlementOverrides(ctx, subj.ID)
	for _, ov := range overrides {
		fk := FeatureKey(ov.FeatureKey)
		f := features[fk]
		f.FeatureKey = fk
		if ov.BoolValue.Valid {
			f.GrantType = "boolean"
			f.BoolValue = ov.BoolValue.Bool
		}
		if ov.IntValue.Valid {
			f.GrantType = "integer"
			f.IntValue = ov.IntValue.Int64
		}
		if ov.TextValue.Valid {
			f.GrantType = "enum"
			f.TextValue = ov.TextValue.String
		}
		f.Source = ov.GrantSource + ":" + ov.GrantVersion
		features[fk] = f
	}

	// If subscription is expired/suspended/chargeback_review, block paid-only writes while preserving read/export
	if sub.State == "expired" || sub.State == "suspended" || sub.State == "chargeback_review" {
		for _, fk := range []FeatureKey{FeatBusinessStorefront, FeatCSVImportEnabled, FeatBusinessAIDocDraft} {
			f := features[fk]
			f.BoolValue = false
			features[fk] = f
		}
	}

	return SubjectEntitlementSnapshot{
		Subject:             subj,
		Subscription:        sub,
		Plan:                plan,
		CommercialMode:      modeCfg.Mode,
		EntitlementRevision: sub.EntitlementRevision,
		Addons:              addons,
		Features:            features,
	}, nil
}

func (s *Service) CheckFeature(ctx context.Context, workspaceID int64, feature FeatureKey, currentCount int64) (EntitlementDecision, error) {
	subj, _, err := s.ResolveSubjectForWorkspace(ctx, workspaceID)
	if err != nil {
		return EntitlementDecision{}, err
	}
	snap, err := s.ResolveEntitlements(ctx, subj.ID)
	if err != nil {
		return EntitlementDecision{}, err
	}
	def, ok := snap.Features[feature]
	decVer := fmt.Sprintf("ent_rev_%d", snap.EntitlementRevision)
	var gracePtr *time.Time
	if snap.Subscription.GraceEndsAt.Valid {
		t := snap.Subscription.GraceEndsAt.Time
		gracePtr = &t
	}

	if snap.Subscription.State == "past_due" || snap.Subscription.State == "chargeback_review" {
		if feature == FeatBusinessStorefront || feature == FeatCSVImportEnabled {
			return EntitlementDecision{
				Allowed: false, Feature: feature, ReasonCode: "SUBSCRIPTION_PAST_DUE",
				PlanCode: snap.Plan.PlanCode, GraceEndsAt: gracePtr, DecisionVersion: decVer,
			}, nil
		}
	}

	if !ok {
		return EntitlementDecision{
			Allowed: false, Feature: feature, ReasonCode: "FEATURE_NOT_INCLUDED",
			PlanCode: snap.Plan.PlanCode, UpgradeOptions: upgradeOptionsFor(feature), DecisionVersion: decVer,
		}, nil
	}

	if def.GrantType == "boolean" {
		if !def.BoolValue {
			return EntitlementDecision{
				Allowed: false, Feature: feature, ReasonCode: "FEATURE_NOT_INCLUDED",
				PlanCode: snap.Plan.PlanCode, UpgradeOptions: upgradeOptionsFor(feature), DecisionVersion: decVer,
			}, nil
		}
		return EntitlementDecision{
			Allowed: true, Feature: feature, ReasonCode: "ALLOWED",
			PlanCode: snap.Plan.PlanCode, DecisionVersion: decVer,
		}, nil
	}

	limit := def.IntValue
	if currentCount >= limit {
		return EntitlementDecision{
			Allowed: false, Feature: feature, ReasonCode: "LIMIT_REACHED",
			PlanCode: snap.Plan.PlanCode, Current: strconv.FormatInt(currentCount, 10), Limit: strconv.FormatInt(limit, 10),
			GraceEndsAt: gracePtr, UpgradeOptions: upgradeOptionsFor(feature), DecisionVersion: decVer,
		}, nil
	}
	return EntitlementDecision{
		Allowed: true, Feature: feature, ReasonCode: "ALLOWED",
		PlanCode: snap.Plan.PlanCode, Current: strconv.FormatInt(currentCount, 10), Limit: strconv.FormatInt(limit, 10),
		GraceEndsAt: gracePtr, DecisionVersion: decVer,
	}, nil
}

// ReserveUsage atomically locks the period usage counter and reserves units only if consumed + reserved + units <= limit.
func (s *Service) ReserveUsage(ctx context.Context, workspaceID int64, feature FeatureKey, commandType, idempKey string, units int64) (db.UsageReservation, EntitlementDecision, error) {
	if units <= 0 {
		units = 1
	}
	subj, _, err := s.ResolveSubjectForWorkspace(ctx, workspaceID)
	if err != nil {
		return db.UsageReservation{}, EntitlementDecision{}, err
	}
	if idempKey != "" {
		if existing, rErr := s.queries.GetUsageReservationByIdemp(ctx, db.GetUsageReservationByIdempParams{
			BillingSubjectID: subj.ID,
			IdempotencyKey:   idempKey,
		}); rErr == nil {
			return existing, EntitlementDecision{Allowed: true, Feature: feature, ReasonCode: "IDEMPOTENT_REPLAY"}, nil
		}
	}

	snap, err := s.ResolveEntitlements(ctx, subj.ID)
	if err != nil {
		return db.UsageReservation{}, EntitlementDecision{}, err
	}
	def, ok := snap.Features[feature]
	if !ok {
		return db.UsageReservation{}, EntitlementDecision{
			Allowed: false, Feature: feature, ReasonCode: "FEATURE_NOT_INCLUDED", PlanCode: snap.Plan.PlanCode,
		}, ErrFeatureNotIncluded
	}

	now := time.Now().UTC()
	pStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	pEnd := pStart.AddDate(0, 1, 0).Add(-time.Second)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.UsageReservation{}, EntitlementDecision{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	counter, err := qtx.UpsertAndLockUsageCounter(ctx, db.UpsertAndLockUsageCounterParams{
		BillingSubjectID: subj.ID,
		FeatureKey:       string(feature),
		PeriodStart:      pgtype.Timestamptz{Time: pStart, Valid: true},
		PeriodEnd:        pgtype.Timestamptz{Time: pEnd, Valid: true},
	})
	if err != nil {
		return db.UsageReservation{}, EntitlementDecision{}, err
	}
	counter, err = qtx.GetUsageCounterForUpdate(ctx, db.GetUsageCounterForUpdateParams{
		BillingSubjectID: subj.ID,
		FeatureKey:       string(feature),
		PeriodStart:      pgtype.Timestamptz{Time: pStart, Valid: true},
	})
	if err != nil {
		return db.UsageReservation{}, EntitlementDecision{}, err
	}

	used := counter.Consumed + counter.Reserved + counter.ManualAdjustment
	if used+units > def.IntValue {
		return db.UsageReservation{}, EntitlementDecision{
			Allowed: false, Feature: feature, ReasonCode: "LIMIT_REACHED", PlanCode: snap.Plan.PlanCode,
			Current: strconv.FormatInt(used, 10), Limit: strconv.FormatInt(def.IntValue, 10),
			ResetAt: &pEnd, UpgradeOptions: upgradeOptionsFor(feature),
			DecisionVersion: fmt.Sprintf("ent_rev_%d", snap.EntitlementRevision),
		}, ErrPlanLimitReached
	}

	if _, err := qtx.AddUsageReservationUnits(ctx, db.AddUsageReservationUnitsParams{
		ID:       counter.ID,
		Reserved: units,
	}); err != nil {
		return db.UsageReservation{}, EntitlementDecision{}, err
	}

	if idempKey == "" {
		idempKey = fmt.Sprintf("res-%d-%s-%d", subj.ID, feature, time.Now().UnixNano())
	}
	resRow, err := qtx.CreateUsageReservation(ctx, db.CreateUsageReservationParams{
		UsageCounterID:   counter.ID,
		BillingSubjectID: subj.ID,
		FeatureKey:       string(feature),
		CommandType:      commandType,
		IdempotencyKey:   idempKey,
		Units:            units,
		ExpiresAt:        pgtype.Timestamptz{Time: now.Add(15 * time.Minute), Valid: true},
	})
	if err != nil {
		return db.UsageReservation{}, EntitlementDecision{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.UsageReservation{}, EntitlementDecision{}, err
	}
	return resRow, EntitlementDecision{
		Allowed: true, Feature: feature, ReasonCode: "RESERVED", PlanCode: snap.Plan.PlanCode,
		Current: strconv.FormatInt(used+units, 10), Limit: strconv.FormatInt(def.IntValue, 10), ResetAt: &pEnd,
	}, nil
}

func (s *Service) ConsumeUsageReservation(ctx context.Context, subjectID, reservationID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	res, err := qtx.SettleUsageReservation(ctx, db.SettleUsageReservationParams{
		ID:               reservationID,
		BillingSubjectID: subjectID,
		Status:           "consumed",
		TerminalReason:   "completed",
	})
	if isNoRows(err) {
		return nil // already settled idempotently
	}
	if err != nil {
		return err
	}
	if _, err := qtx.ConsumeUsageCounterUnits(ctx, db.ConsumeUsageCounterUnitsParams{
		ID:       res.UsageCounterID,
		Reserved: res.Units,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) ReleaseUsageReservation(ctx context.Context, subjectID, reservationID int64, reason string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	status := "released"
	if reason == "expired" {
		status = "expired"
	}
	res, err := qtx.SettleUsageReservation(ctx, db.SettleUsageReservationParams{
		ID:               reservationID,
		BillingSubjectID: subjectID,
		Status:           status,
		TerminalReason:   reason,
	})
	if isNoRows(err) {
		return nil // idempotent
	}
	if err != nil {
		return err
	}
	if _, err := qtx.ReleaseUsageCounterUnits(ctx, db.ReleaseUsageCounterUnitsParams{
		ID:       res.UsageCounterID,
		Reserved: res.Units,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) ReleaseExpiredUsageReservations(ctx context.Context) (int, error) {
	expired, err := s.queries.ListExpiredUsageReservations(ctx)
	if err != nil {
		return 0, err
	}
	released := 0
	for _, r := range expired {
		if err := s.ReleaseUsageReservation(ctx, r.BillingSubjectID, r.ID, "expired"); err == nil {
			released++
		}
	}
	return released, nil
}

func (s *Service) GetUsageSummary(ctx context.Context, subjectID int64) ([]UsageMeter, error) {
	snap, err := s.ResolveEntitlements(ctx, subjectID)
	if err != nil {
		return nil, err
	}
	counters, err := s.queries.ListUsageCountersBySubject(ctx, subjectID)
	if err != nil {
		return nil, err
	}
	byKey := make(map[string]db.UsageCounter, len(counters))
	for _, c := range counters {
		byKey[c.FeatureKey] = c
	}

	now := time.Now().UTC()
	pStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	pEnd := pStart.AddDate(0, 1, 0).Add(-time.Second)

	metered := []FeatureKey{
		FeatRecordsConfirmedMonthly, FeatAIDraftMonthly, FeatAccountsActiveMax,
		FeatCategoriesCustomMax, FeatBudgetsActiveMax, FeatBusinessStaffMax, FeatBusinessOutletsMax,
	}
	var out []UsageMeter
	for _, fk := range metered {
		def, ok := snap.Features[fk]
		if !ok {
			continue
		}
		c := byKey[string(fk)]
		used := c.Consumed + c.Reserved + c.ManualAdjustment
		// For active-count resources, read real active counts from workspace
		switch fk {
		case FeatAccountsActiveMax:
			_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM money_accounts WHERE workspace_id = $1 AND is_active = true`, snap.Subject.WorkspaceID).Scan(&used)
		case FeatCategoriesCustomMax:
			_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM categories WHERE workspace_id = $1 AND is_active = true AND is_system = false`, snap.Subject.WorkspaceID).Scan(&used)
		case FeatBudgetsActiveMax:
			_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM budgets WHERE workspace_id = $1 AND is_active = true`, snap.Subject.WorkspaceID).Scan(&used)
		case FeatBusinessStaffMax:
			_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM workspace_memberships wm JOIN roles r ON r.id = wm.role_id WHERE wm.workspace_id = $1 AND wm.status = 'active' AND r.code = 'staff'`, snap.Subject.WorkspaceID).Scan(&used)
		case FeatBusinessOutletsMax:
			_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM outlets WHERE workspace_id = $1 AND is_active = true`, snap.Subject.WorkspaceID).Scan(&used)
		}

		pct := 0
		if def.IntValue > 0 {
			pct = int((used * 100) / def.IntValue)
		}
		warn := "ok"
		if pct >= 100 {
			warn = "reached_100"
		} else if pct >= 90 {
			warn = "warn_90"
		} else if pct >= 70 {
			warn = "warn_70"
		}
		out = append(out, UsageMeter{
			FeatureKey: fk, Consumed: used, Reserved: c.Reserved, ManualAdjustment: c.ManualAdjustment,
			Limit: def.IntValue, PercentUsed: pct, WarningLevel: warn, PeriodStart: pStart, PeriodEnd: pEnd,
		})
	}
	return out, nil
}

func (s *Service) GetDowngradeImpact(ctx context.Context, subjectID, targetPlanVersionID int64) (DowngradeImpactPreview, error) {
	snap, err := s.ResolveEntitlements(ctx, subjectID)
	if err != nil {
		return DowngradeImpactPreview{}, err
	}
	targetPlan, err := s.queries.GetPlanVersionByID(ctx, targetPlanVersionID)
	if isNoRows(err) {
		return DowngradeImpactPreview{}, ErrPlanVersionUnavailable
	}
	if err != nil {
		return DowngradeImpactPreview{}, err
	}
	targetDefs, err := s.queries.ListPlanEntitlementDefinitions(ctx, targetPlan.ID)
	if err != nil {
		return DowngradeImpactPreview{}, err
	}
	targetMap := make(map[FeatureKey]db.PlanEntitlementDefinition, len(targetDefs))
	for _, d := range targetDefs {
		targetMap[FeatureKey(d.FeatureKey)] = d
	}

	meters, _ := s.GetUsageSummary(ctx, subjectID)
	var excess []DowngradeExcessItem
	requiresSelect := false
	for _, m := range meters {
		tDef, ok := targetMap[m.FeatureKey]
		if !ok {
			continue
		}
		if tDef.GrantType == "integer" && m.Consumed > tDef.IntValue.Int64 {
			requiresSelect = true
			excess = append(excess, DowngradeExcessItem{
				ResourceType: string(m.FeatureKey),
				CurrentCount: m.Consumed,
				TargetLimit:  tDef.IntValue.Int64,
				ExcessCount:  m.Consumed - tDef.IntValue.Int64,
				Preservation: "Existing records and audit history remain intact; excess items become restricted/archived without deletion.",
			})
		}
	}

	var restricted []string
	for fk, cur := range snap.Features {
		if cur.GrantType == "boolean" && cur.BoolValue {
			if td, ok := targetMap[fk]; !ok || !td.BoolValue.Bool {
				restricted = append(restricted, string(fk))
			}
		}
	}

	return DowngradeImpactPreview{
		SubjectID:          subjectID,
		CurrentPlanCode:    snap.Plan.PlanCode,
		TargetPlanCode:     targetPlan.PlanCode,
		TargetPlanVersion:  targetPlan.Version,
		RequiresSelection:  requiresSelect,
		ExcessItems:        excess,
		RestrictedFeatures: restricted,
		PreservedGuarantee: "Downgrade never deletes journals, transactions, invoices, customers, inventory history, attachments, or personal records. Ownership export remains available.",
	}, nil
}

func (s *Service) OwnershipTransferBillingSubject(ctx context.Context, subjectID, newOwnerUserID int64, billingName, billingEmail string) (db.BillingSubject, error) {
	subj, err := s.queries.GetBillingSubjectByID(ctx, subjectID)
	if isNoRows(err) {
		return db.BillingSubject{}, ErrNotFound
	}
	if err != nil {
		return db.BillingSubject{}, err
	}
	updated, err := s.queries.TransferBillingSubjectOwner(ctx, db.TransferBillingSubjectOwnerParams{
		ID:           subj.ID,
		OwnerUserID:  newOwnerUserID,
		BillingName:  strings.TrimSpace(billingName),
		BillingEmail: strings.TrimSpace(billingEmail),
	})
	if err != nil {
		return db.BillingSubject{}, err
	}
	_, _ = s.pool.Exec(ctx, `INSERT INTO audit_events (workspace_id, actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1, $2, 'billing_ownership_transferred', 'billing_subject', $3, $4)`,
		subj.WorkspaceID, newOwnerUserID, strconv.FormatInt(subj.ID, 10), fmt.Sprintf(`{"new_owner_user_id":%d}`, newOwnerUserID))
	return updated, nil
}

func upgradeOptionsFor(feature FeatureKey) []string {
	switch feature {
	case FeatBusinessStaffMax:
		return []string{"addon_staff"}
	case FeatBusinessOutletsMax:
		return []string{"addon_outlet"}
	case FeatBusinessCustomDomainMax:
		return []string{"addon_custom_domain"}
	case FeatAIDraftMonthly, FeatAIDraftPackBalance:
		return []string{"addon_ai_pack", "personal_plus_monthly", "business_monthly"}
	case FeatAttachmentsStorageBytes:
		return []string{"addon_storage_pack", "personal_plus_monthly", "business_monthly"}
	default:
		if strings.HasPrefix(string(feature), "business.") {
			return []string{"business_monthly", "business_yearly"}
		}
		return []string{"personal_plus_monthly", "personal_plus_yearly"}
	}
}
