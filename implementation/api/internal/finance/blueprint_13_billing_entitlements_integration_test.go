package finance_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/billing"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func createBlueprint13Env(t *testing.T, prefix string) (*pgxpool.Pool, int64, int64, int64, int64) {
	t.Helper()
	pool := testPool(t)
	ctx := context.Background()
	suffix := time.Now().UnixNano()

	var ownerID, staffID, personalWS, businessWS int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, fmt.Sprintf("%s-owner-%d", prefix, suffix)).Scan(&ownerID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, fmt.Sprintf("%s-staff-%d", prefix, suffix)).Scan(&staffID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('personal', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" Personal", fmt.Sprintf("%s-pers-%d", prefix, suffix), ownerID).Scan(&personalWS))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" Biz", fmt.Sprintf("%s-biz-%d", prefix, suffix), ownerID).Scan(&businessWS))

	t.Cleanup(func() {
		for _, wsID := range []int64{personalWS, businessWS} {
			_, _ = pool.Exec(ctx, `DELETE FROM audit_events WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM billing_subjects WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM money_accounts WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, wsID)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, ownerID, staffID)
		_, _ = pool.Exec(ctx, `UPDATE commercial_mode_config SET mode = 'controlled_beta' WHERE id = 1`)
	})

	return pool, personalWS, businessWS, ownerID, staffID
}

func signPaystack(secret string, body []byte) string {
	mac := hmac.New(sha512.New, []byte(secret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestBlueprint13_ControlledBetaEntitlementsAndConcurrency(t *testing.T) {
	pool, personalWS, businessWS, _, _ := createBlueprint13Env(t, "bp13-ent")
	ctx := context.Background()
	svc := finance.NewService(pool)

	// 1. Default commercial_mode is controlled_beta; checkout must be blocked.
	mode, err := svc.GetCommercialMode(ctx)
	require.NoError(t, err)
	require.Equal(t, "controlled_beta", mode.Mode)
	require.False(t, mode.CheckoutEnabled)

	pSubj, _, err := svc.ResolveSubjectForWorkspace(ctx, personalWS)
	require.NoError(t, err)

	plans, err := svc.ListPlans(ctx, "personal", nil)
	require.NoError(t, err)
	var plusMonthlyID int64
	for _, p := range plans {
		if p.PlanCode == "personal_plus_monthly" {
			plusMonthlyID = p.ID
		}
	}
	require.NotZero(t, plusMonthlyID)

	_, err = svc.CreateCheckoutIntent(ctx, pSubj.ID, pSubj.OwnerUserID, "chk-beta-1", finance.CreateCheckoutInput{
		PlanVersionID: plusMonthlyID,
	})
	require.ErrorIs(t, err, finance.ErrCheckoutNotAvailable)

	// 2. Personal workspace does not unlock Business features.
	dec, err := svc.CheckFeature(ctx, personalWS, finance.FeatBusinessInventory, 0)
	require.NoError(t, err)
	require.False(t, dec.Allowed)
	require.Equal(t, "FEATURE_NOT_INCLUDED", dec.ReasonCode)

	// 3. Business workspace unlocks Business features.
	bDec, err := svc.CheckFeature(ctx, businessWS, finance.FeatBusinessInventory, 0)
	require.NoError(t, err)
	require.True(t, bDec.Allowed)

	// 4. Atomic concurrent reservation: Free personal has 100 monthly records; reserve 98, then 5 concurrent requests compete for final 2.
	_, _, err = svc.ReserveUsage(ctx, personalWS, finance.FeatRecordsConfirmedMonthly, "test", "bulk-98", 98)
	require.NoError(t, err)

	var wg sync.WaitGroup
	var okCnt int32
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, _, rErr := svc.ReserveUsage(ctx, personalWS, finance.FeatRecordsConfirmedMonthly, "test", fmt.Sprintf("race-%d", idx), 1)
			if rErr == nil {
				atomic.AddInt32(&okCnt, 1)
			}
		}(i)
	}
	wg.Wait()
	require.Equal(t, int32(2), okCnt)

	// 5. Expired reservation release
	_, err = pool.Exec(ctx, `UPDATE usage_reservations SET expires_at = now() - interval '1 minute' WHERE billing_subject_id = $1 AND status = 'reserved'`, pSubj.ID)
	require.NoError(t, err)
	released, err := svc.ReleaseExpiredUsageReservations(ctx)
	require.NoError(t, err)
	require.Equal(t, 3, released)
}

func TestBlueprint13_CheckoutWebhooksDowngradeAndRefunds(t *testing.T) {
	pool, personalWS, businessWS, ownerID, _ := createBlueprint13Env(t, "bp13-pay")
	ctx := context.Background()

	secret := "sk_test_bp13_secret"
	paystackMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/transaction/initialize":
			_, _ = w.Write([]byte(`{"status":true,"message":"Authorization URL created","data":{"authorization_url":"https://checkout.paystack.test/abc","access_code":"acc_123","reference":"rk_chk_mock"}}`))
		case "/refund":
			_, _ = w.Write([]byte(`{"status":true,"message":"Refund queued","data":{"id":"rf_123","status":"pending"}}`))
		default:
			_, _ = w.Write([]byte(`{"status":true,"data":{"reference":"rk_chk_mock","status":"success","amount":150000,"currency":"NGN"}}`))
		}
	}))
	defer paystackMock.Close()

	provider := billing.NewPaystackProvider(secret, secret, paystackMock.URL, 5*time.Second)
	svc := finance.NewService(pool, finance.WithPaymentProvider(provider))

	// Temporarily switch to public_paid for webhook & checkout verification test (restored in t.Cleanup)
	_, err := svc.SetCommercialMode(ctx, "public_paid", ownerID)
	require.NoError(t, err)

	pSubj, _, err := svc.ResolveSubjectForWorkspace(ctx, personalWS)
	require.NoError(t, err)
	bSubj, _, err := svc.ResolveSubjectForWorkspace(ctx, businessWS)
	require.NoError(t, err)

	plans, err := svc.ListPlans(ctx, "personal", nil)
	require.NoError(t, err)
	var plusMonthlyID, freeID int64
	for _, p := range plans {
		if p.PlanCode == "personal_plus_monthly" {
			plusMonthlyID = p.ID
		} else if p.PlanCode == "free" {
			freeID = p.ID
		}
	}

	// 1. Checkout uses authoritative server price (150000 kobo = NGN 1,500)
	intent, err := svc.CreateCheckoutIntent(ctx, pSubj.ID, ownerID, "idemp-chk-1", finance.CreateCheckoutInput{
		PlanVersionID: plusMonthlyID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(150000), intent.AmountMinor)
	require.Equal(t, "pending", intent.Status)

	// 2. Invalid webhook signature rejected
	badBody := []byte(fmt.Sprintf(`{"event":"charge.success","data":{"id":101,"reference":%q,"amount":150000,"currency":"NGN"}}`, intent.Reference))
	_, err = svc.ProcessPaystackWebhook(ctx, badBody, "invalid-sig")
	require.ErrorIs(t, err, billing.ErrInvalidWebhookSig)

	// 3. Valid webhook activates subscription + creates billing transaction & receipt document
	nowStr := time.Now().UTC().Format(time.RFC3339)
	goodBody := []byte(fmt.Sprintf(`{"event":"charge.success","data":{"id":102,"reference":%q,"amount":150000,"currency":"NGN","paid_at":%q}}`, intent.Reference, nowStr))
	outcome, err := svc.ProcessPaystackWebhook(ctx, goodBody, signPaystack(secret, goodBody))
	require.NoError(t, err)
	require.Equal(t, "processed", outcome)

	// 4. Duplicate webhook is idempotent
	dupOutcome, err := svc.ProcessPaystackWebhook(ctx, goodBody, signPaystack(secret, goodBody))
	require.NoError(t, err)
	require.Equal(t, "duplicate_ignored", dupOutcome)

	// 5. Out-of-order older webhook cannot regress active paid-through state
	oldTime := time.Now().UTC().Add(-48 * time.Hour).Format(time.RFC3339)
	oldBody := []byte(fmt.Sprintf(`{"event":"invoice.payment_failed","data":{"id":103,"reference":%q,"amount":150000,"currency":"NGN","created_at":%q}}`, intent.Reference, oldTime))
	_, err = svc.ProcessPaystackWebhook(ctx, oldBody, signPaystack(secret, oldBody))
	require.NoError(t, err)
	snap, err := svc.ResolveEntitlements(ctx, pSubj.ID)
	require.NoError(t, err)
	require.Equal(t, "active", snap.Subscription.State)

	// 6. Cancel at period end & resume
	cancelled, err := svc.CancelSubscription(ctx, pSubj.ID, "testing cancel")
	require.NoError(t, err)
	require.Equal(t, "cancel_at_period_end", cancelled.State)
	resumed, err := svc.ResumeSubscription(ctx, pSubj.ID)
	require.NoError(t, err)
	require.Equal(t, "active", resumed.State)

	// 7. Refund limits: cannot exceed captured payment (150000)
	txs, err := svc.ListBillingTransactions(ctx, pSubj.ID)
	require.NoError(t, err)
	require.Len(t, txs, 1)
	_, err = svc.RequestRefund(ctx, pSubj.ID, ownerID, "ref-over", finance.RequestRefundInput{
		BillingTransactionID: txs[0].ID, AmountMinor: 200000, Reason: "too high",
	})
	require.Error(t, err)
	ref, err := svc.RequestRefund(ctx, pSubj.ID, ownerID, "ref-ok", finance.RequestRefundInput{
		BillingTransactionID: txs[0].ID, AmountMinor: 50000, Reason: "partial refund",
	})
	require.NoError(t, err)
	require.Equal(t, int64(50000), ref.AmountMinor)

	// 8. Downgrade impact: create 4 active accounts on personalWS (> Free limit of 3) and verify impact + preservation
	for i := 0; i < 4; i++ {
		_, err = pool.Exec(ctx, `INSERT INTO money_accounts (workspace_id, name, account_type, currency) VALUES ($1, $2, 'bank', 'NGN')`,
			personalWS, fmt.Sprintf("Acct-%d", i))
		require.NoError(t, err)
	}
	impact, err := svc.GetDowngradeImpact(ctx, pSubj.ID, freeID)
	require.NoError(t, err)
	require.True(t, impact.RequiresSelection)
	require.NotEmpty(t, impact.ExcessItems)

	_, err = svc.ChangePlan(ctx, pSubj.ID, ownerID, "chg-blocked", finance.ChangePlanInput{TargetPlanVersionID: freeID, AcceptDowngrade: false})
	require.ErrorIs(t, err, finance.ErrDowngradeRequiresSelect)

	// 9. Business billing subject stays separate from Personal
	require.NotEqual(t, pSubj.ID, bSubj.ID)
}
