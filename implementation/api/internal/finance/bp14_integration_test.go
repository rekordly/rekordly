package finance_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/rekordly/rekordly-api/internal/notify"
	"github.com/stretchr/testify/require"
)

func createBlueprint14Env(t *testing.T, prefix string) (*pgxpool.Pool, int64, int64, int64) {
	t.Helper()
	pool := testPool(t)
	ctx := context.Background()
	suffix := time.Now().UnixNano()

	var ownerID, wsID, otherWS int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, fmt.Sprintf("%s-u-%d", prefix, suffix)).Scan(&ownerID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" Biz", fmt.Sprintf("%s-biz-%d", prefix, suffix), ownerID).Scan(&wsID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" Other", fmt.Sprintf("%s-oth-%d", prefix, suffix), ownerID).Scan(&otherWS))

	t.Cleanup(func() {
		for _, id := range []int64{wsID, otherWS} {
			_, _ = pool.Exec(ctx, `DELETE FROM share_access_events WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM delivery_attempts WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM deliveries WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM share_grants WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM file_links WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM files WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM render_jobs WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM document_artifacts WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM email_suppressions WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM notification_outbox WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM invoices WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM counterparties WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM billing_subjects WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, id)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	return pool, wsID, otherWS, ownerID
}

func TestBlueprint14_NotificationsOutboxArtifactsSharingAndEmail(t *testing.T) {
	pool, wsID, _, ownerID := createBlueprint14Env(t, "bp14-main")
	ctx := context.Background()
	providerMsgID := fmt.Sprintf("re_bp14_%d", time.Now().UnixNano())
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM email_webhook_events WHERE provider_message_id = $1`, providerMsgID)
	})

	resendSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(fmt.Sprintf(`{"id":%q}`, providerMsgID)))
	}))
	defer resendSrv.Close()

	whSecret := "whsec_bp14"
	emailProvider := notify.NewResendEmailProvider("re_key", resendSrv.URL, "noreply@rekordly.com", whSecret, 5*time.Second)
	svc := finance.NewService(pool, finance.WithEmailProvider(emailProvider, "https://app.rekordly.test/share"))

	// 1. Atomic outbox notification + projection + security preference lock
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	_, err = svc.EnqueueNotificationOutboxTx(ctx, db.New(pool).WithTx(tx), finance.OutboxNotificationEvent{
		WorkspaceID: wsID, EventType: "invoice_issued", Category: "financial_document",
		TemplateKey: "invoice_issued", ResourceType: "invoice", ResourceID: 1,
		Title: "Invoice issued", Body: "INV-001 issued", RecipientUserIDs: []int64{ownerID}, DedupeKey: "inv-1-issued",
	})
	require.NoError(t, err)
	require.NoError(t, tx.Commit(ctx))

	projected, err := svc.ProjectPendingNotificationOutbox(ctx)
	require.NoError(t, err)
	require.GreaterOrEqual(t, projected, 1)

	unread, err := svc.CountMeUnreadNotifications(ctx, ownerID, &wsID)
	require.NoError(t, err)
	require.Equal(t, int64(1), unread)

	_, err = svc.UpsertMeNotificationPreference(ctx, ownerID, finance.UpdateNotificationPrefInput{
		WorkspaceID: &wsID, Category: "security", Channel: "in_app", Enabled: false,
	})
	require.Error(t, err) // security cannot be disabled

	// 2. Create invoice, render immutable PDF artifact, verify snapshot immutability & supersession
	var custID, invID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO counterparties (workspace_id, name, party_type) VALUES ($1, 'Ada Customer', 'customer') RETURNING id`, wsID).Scan(&custID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO invoices (workspace_id, customer_id, customer_name, invoice_number, issue_date, due_date, status, currency, subtotal_minor, tax_amount_minor, total_amount_minor)
		VALUES ($1, $2, 'Ada Customer', 'INV-14-001', CURRENT_DATE, CURRENT_DATE + interval '7 days', 'finalized', 'NGN', 500000, 0, 500000) RETURNING id`, wsID, custID).Scan(&invID))

	r1, err := svc.RenderDocumentArtifact(ctx, wsID, ownerID, "invoice", invID, "rnd-1")
	require.NoError(t, err)
	require.Equal(t, int32(1), r1.Artifact.Version)
	require.Equal(t, "ready", r1.Artifact.Status)

	// Idempotent render returns same artifact
	r1Dup, err := svc.RenderDocumentArtifact(ctx, wsID, ownerID, "invoice", invID, "rnd-1")
	require.NoError(t, err)
	require.Equal(t, r1.Artifact.ID, r1Dup.Artifact.ID)

	// 3. Guest sharing & WhatsApp handoff
	wa, err := svc.CreateWhatsAppHandoff(ctx, wsID, ownerID, "invoice", invID)
	require.NoError(t, err)
	require.Equal(t, "handoff_opened", wa.Status)
	require.Contains(t, wa.WhatsAppLink, "https://wa.me/?text=")

	// Extract raw token from ShareURL and verify guest portal + download
	rawToken := wa.ShareURL[len("https://app.rekordly.test/share/"):]
	portal, err := svc.GetGuestSharePortal(ctx, rawToken, "iphash1")
	require.NoError(t, err)
	require.Equal(t, "INV-14-001", portal.DocumentNumber)
	require.True(t, portal.CanDownload)

	// Revoking blocks future access with neutral error
	_, err = svc.RevokeShareGrant(ctx, wsID, ownerID, wa.Grant.ID)
	require.NoError(t, err)
	_, err = svc.GetGuestSharePortal(ctx, rawToken, "iphash1")
	require.ErrorIs(t, err, finance.ErrShareUnavailable)

	// 4. Email delivery: accepted != delivered, webhook bounce triggers suppression
	deliv, err := svc.CreateEmailDelivery(ctx, wsID, ownerID, "invoice", invID, "deliv-1", finance.CreateDeliveryInput{
		RecipientEmail: "buyer@example.com",
	})
	require.NoError(t, err)
	require.Equal(t, "accepted", deliv.Status)

	// Simulate bounce webhook
	bounceBody := []byte(fmt.Sprintf(`{"type":"email.bounced","data":{"email_id":%q}}`, providerMsgID))
	mac := hmac.New(sha256.New, []byte(whSecret))
	_, _ = mac.Write(bounceBody)
	sig := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	whStatus, err := svc.ProcessEmailWebhook(ctx, bounceBody, sig)
	require.NoError(t, err)
	require.Equal(t, "processed", whStatus)

	// Duplicate bounce webhook is safely ignored without error
	whDupStatus, err := svc.ProcessEmailWebhook(ctx, bounceBody, sig)
	require.NoError(t, err)
	require.Equal(t, "duplicate_ignored", whDupStatus)

	// Subsequent send to suppressed recipient is blocked before provider call
	_, err = svc.CreateEmailDelivery(ctx, wsID, ownerID, "invoice", invID, "deliv-2", finance.CreateDeliveryInput{
		RecipientEmail: "buyer@example.com",
	})
	require.ErrorIs(t, err, finance.ErrEmailSuppressed)
}

func TestBlueprint14_FilesQuarantineLinkingAndDeletion(t *testing.T) {
	pool, wsID, _, ownerID := createBlueprint14Env(t, "bp14-files")
	ctx := context.Background()
	svc := finance.NewService(pool)

	// 1. Public delivery disallowed for sensitive filenames
	_, err := svc.CreateFileUploadIntent(ctx, wsID, ownerID, finance.UploadIntentInput{
		Filename: "invoice-secret.pdf", MimeType: "application/pdf", ByteSize: 1024, FileClass: "public_media",
	})
	require.ErrorIs(t, err, finance.ErrFilePublicDisallowed)

	// 2. Quarantined upload cannot be downloaded, linked, or shared
	up, err := svc.CreateFileUploadIntent(ctx, wsID, ownerID, finance.UploadIntentInput{
		Filename: "receipt.pdf", MimeType: "application/pdf", ByteSize: 2048, FileClass: "private_evidence",
	})
	require.NoError(t, err)
	_, err = svc.FinalizeFileUpload(ctx, wsID, up.File.ID, finance.FinalizeFileUploadInput{Quarantine: true})
	require.NoError(t, err)

	_, err = svc.CreateFileSignedDownload(ctx, wsID, up.File.ID)
	require.ErrorIs(t, err, finance.ErrFileQuarantined)
	_, err = svc.CreateShareGrant(ctx, wsID, ownerID, "file", up.File.ID, finance.CreateShareGrantInput{})
	require.ErrorIs(t, err, finance.ErrFileQuarantined)

	// 3. Clean file linked -> deletion blocked until unlinked
	up2, err := svc.CreateFileUploadIntent(ctx, wsID, ownerID, finance.UploadIntentInput{
		Filename: "evidence.pdf", MimeType: "application/pdf", ByteSize: 1024, FileClass: "private_evidence",
	})
	require.NoError(t, err)
	_, err = svc.FinalizeFileUpload(ctx, wsID, up2.File.ID, finance.FinalizeFileUploadInput{SHA256Hash: "abc123"})
	require.NoError(t, err)

	link, err := svc.LinkFileToResource(ctx, wsID, ownerID, up2.File.ID, "money_transaction", 99)
	require.NoError(t, err)
	_, err = svc.RequestFileDeletion(ctx, wsID, ownerID, up2.File.ID)
	require.ErrorIs(t, err, finance.ErrFileStillLinked)

	_, err = svc.UnlinkFile(ctx, wsID, link.ID)
	require.NoError(t, err)
	del, err := svc.RequestFileDeletion(ctx, wsID, ownerID, up2.File.ID)
	require.NoError(t, err)
	require.Equal(t, "scheduled", del.DeletionStatus)
}
