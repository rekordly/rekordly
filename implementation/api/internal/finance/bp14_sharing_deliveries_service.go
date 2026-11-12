package finance

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/notify"
	"github.com/rekordly/rekordly-api/internal/storage"
)

var (
	ErrShareUnavailable = errors.New("SHARE_LINK_UNAVAILABLE")
	ErrEmailSuppressed  = errors.New("EMAIL_RECIPIENT_SUPPRESSED")
	ErrDeliveryNotRetry = errors.New("DELIVERY_NOT_RETRYABLE")
)

type CreateShareGrantInput struct {
	ArtifactID     *int64   `json:"artifact_id"`
	Permissions    []string `json:"permissions"` // view, download
	Purpose        string   `json:"purpose"`
	ExpiresInHours int      `json:"expires_in_hours"`
}

type ShareGrantCreated struct {
	Grant    db.ShareGrant `json:"grant"`
	ShareURL string        `json:"share_url"`
	// RawToken is returned once at creation time and NEVER stored in plaintext or logged.
	RawToken string `json:"raw_token"`
}

type GuestPortalDocument struct {
	DocumentType   string `json:"document_type"`
	DocumentNumber string `json:"document_number"`
	DocumentDate   string `json:"document_date"`
	Status         string `json:"status"`
	Version        int32  `json:"version"`
	SenderName     string `json:"sender_name"`
	RecipientName  string `json:"recipient_name"`
	Currency       string `json:"currency"`
	TotalDisplay   string `json:"total_display"`
	PaymentState   string `json:"payment_state"`
	CanDownload    bool   `json:"can_download"`
	ExpiresAt      string `json:"expires_at"`
	ArtifactReady  bool   `json:"artifact_ready"`
}

type WhatsAppHandoffResult struct {
	Grant        db.ShareGrant `json:"grant"`
	ShareURL     string        `json:"share_url"`
	MessageText  string        `json:"message_text"`
	WhatsAppLink string        `json:"whatsapp_link"`
	Status       string        `json:"status"` // handoff_opened
	Disclosure   string        `json:"disclosure"`
}

type CreateDeliveryInput struct {
	RecipientEmail string `json:"recipient_email" binding:"required"`
	ReplyTo        string `json:"reply_to"`
	TemplateKey    string `json:"template_key"`
	ArtifactID     *int64 `json:"artifact_id"`
	IsResend       bool   `json:"is_resend"`
	ResendOfID     *int64 `json:"resend_of_delivery_id"`
}

func maskEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 || len(parts[0]) == 0 {
		return "***"
	}
	local := parts[0]
	if len(local) <= 2 {
		return local[:1] + "***@" + parts[1]
	}
	return local[:2] + "***@" + parts[1]
}

func (s *Service) shareBaseURL() string {
	if s.guestShareBaseURL != "" {
		return s.guestShareBaseURL
	}
	return "http://localhost:3000/share"
}

func (s *Service) CreateShareGrant(ctx context.Context, workspaceID, userID int64, resourceType string, resourceID int64, in CreateShareGrantInput) (ShareGrantCreated, error) {
	resourceType = strings.ToLower(strings.TrimSpace(resourceType))
	if resourceType == "file" {
		f, err := s.queries.GetFileByID(ctx, db.GetFileByIDParams{ID: resourceID, WorkspaceID: workspaceID})
		if isNoRows(err) {
			return ShareGrantCreated{}, ErrNotFound
		}
		if err != nil {
			return ShareGrantCreated{}, err
		}
		if f.ScanStatus == "quarantined" {
			return ShareGrantCreated{}, ErrFileQuarantined
		}
	}

	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		return ShareGrantCreated{}, err
	}
	rawToken := base64.RawURLEncoding.EncodeToString(rawBytes)
	tokenHash := hashOpaqueToken(rawToken)

	perms := in.Permissions
	if len(perms) == 0 {
		perms = []string{"view", "download"}
	}
	permsJSON, _ := json.Marshal(perms)

	hours := in.ExpiresInHours
	if hours <= 0 || hours > 24*90 {
		hours = 24 * 7
	}
	expAt := time.Now().UTC().Add(time.Duration(hours) * time.Hour)

	var artID pgtype.Int8
	if in.ArtifactID != nil {
		artID = pgtype.Int8{Int64: *in.ArtifactID, Valid: true}
	}
	purpose := strings.TrimSpace(in.Purpose)
	if purpose == "" {
		purpose = "guest_portal"
	}

	grant, err := s.queries.CreateShareGrant(ctx, db.CreateShareGrantParams{
		WorkspaceID:     workspaceID,
		TokenHash:       tokenHash,
		ResourceType:    resourceType,
		ResourceID:      resourceID,
		ArtifactID:      artID,
		Version:         1,
		Permissions:     permsJSON,
		Purpose:         purpose,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: userID > 0},
		ExpiresAt:       pgtype.Timestamptz{Time: expAt, Valid: true},
	})
	if err != nil {
		return ShareGrantCreated{}, err
	}
	return ShareGrantCreated{
		Grant:    grant,
		ShareURL: s.shareBaseURL() + "/" + rawToken,
		RawToken: rawToken,
	}, nil
}

func (s *Service) ListShareGrants(ctx context.Context, workspaceID int64, resourceType string, resourceID int64) ([]db.ShareGrant, error) {
	return s.queries.ListShareGrantsByDocument(ctx, db.ListShareGrantsByDocumentParams{
		WorkspaceID:  workspaceID,
		ResourceType: strings.ToLower(strings.TrimSpace(resourceType)),
		ResourceID:   resourceID,
	})
}

func (s *Service) RevokeShareGrant(ctx context.Context, workspaceID, userID, grantID int64) (db.ShareGrant, error) {
	g, err := s.queries.RevokeShareGrant(ctx, db.RevokeShareGrantParams{
		ID:              grantID,
		WorkspaceID:     workspaceID,
		RevokedByUserID: pgtype.Int8{Int64: userID, Valid: userID > 0},
	})
	if isNoRows(err) {
		return db.ShareGrant{}, ErrNotFound
	}
	return g, err
}

func (s *Service) resolveValidShareGrant(ctx context.Context, rawToken string) (db.ShareGrant, error) {
	if strings.TrimSpace(rawToken) == "" {
		return db.ShareGrant{}, ErrShareUnavailable
	}
	g, err := s.queries.GetShareGrantByTokenHash(ctx, hashOpaqueToken(rawToken))
	if err != nil || g.RevokedAt.Valid || g.ExpiresAt.Time.Before(time.Now().UTC()) {
		return db.ShareGrant{}, ErrShareUnavailable
	}
	return g, nil
}

// GetGuestSharePortal returns strictly narrowed, safe guest DTO — never internal notes, costs, or staff data.
func (s *Service) GetGuestSharePortal(ctx context.Context, rawToken, ipHash string) (GuestPortalDocument, error) {
	g, err := s.resolveValidShareGrant(ctx, rawToken)
	if err != nil {
		return GuestPortalDocument{}, err
	}
	_ = s.queries.RecordShareAccessCounter(ctx, db.RecordShareAccessCounterParams{ID: g.ID, Column2: "viewed"})
	_, _ = s.queries.CreateShareAccessEvent(ctx, db.CreateShareAccessEventParams{
		ShareGrantID: pgtype.Int8{Int64: g.ID, Valid: true},
		WorkspaceID:  pgtype.Int8{Int64: g.WorkspaceID, Valid: true},
		EventType:    "viewed",
		IpHash:       ipHash,
	})

	var perms []string
	_ = json.Unmarshal(g.Permissions, &perms)
	canDL := false
	for _, p := range perms {
		if p == "download" {
			canDL = true
		}
	}

	var art db.DocumentArtifact
	var hasArt bool
	if g.ArtifactID.Valid {
		if a, aErr := s.queries.GetDocumentArtifactByID(ctx, db.GetDocumentArtifactByIDParams{ID: g.ArtifactID.Int64, WorkspaceID: g.WorkspaceID}); aErr == nil {
			art = a
			hasArt = true
		}
	} else if a, aErr := s.queries.GetLatestDocumentArtifact(ctx, db.GetLatestDocumentArtifactParams{
		WorkspaceID: g.WorkspaceID, DocumentType: g.ResourceType, DocumentID: g.ResourceID,
	}); aErr == nil {
		art = a
		hasArt = true
	}

	if hasArt {
		var snap storage.DocumentSnapshot
		_ = json.Unmarshal(art.SnapshotJson, &snap)
		return GuestPortalDocument{
			DocumentType:   snap.DocumentType,
			DocumentNumber: snap.DocumentNumber,
			DocumentDate:   snap.DocumentDate,
			Status:         snap.Status,
			Version:        snap.Version,
			SenderName:     snap.SenderName,
			RecipientName:  snap.RecipientName,
			Currency:       snap.Currency,
			TotalDisplay:   snap.TotalDisplay,
			PaymentState:   snap.PaymentState,
			CanDownload:    canDL && art.Status == "ready",
			ExpiresAt:      g.ExpiresAt.Time.Format(time.RFC3339),
			ArtifactReady:  art.Status == "ready",
		}, nil
	}

	snap, err := s.buildImmutableDocumentSnapshot(ctx, g.WorkspaceID, g.ResourceType, g.ResourceID)
	if err != nil {
		return GuestPortalDocument{}, ErrShareUnavailable
	}
	return GuestPortalDocument{
		DocumentType:   snap.DocumentType,
		DocumentNumber: snap.DocumentNumber,
		DocumentDate:   snap.DocumentDate,
		Status:         snap.Status,
		Version:        snap.Version,
		SenderName:     snap.SenderName,
		RecipientName:  snap.RecipientName,
		Currency:       snap.Currency,
		TotalDisplay:   snap.TotalDisplay,
		PaymentState:   snap.PaymentState,
		CanDownload:    canDL,
		ExpiresAt:      g.ExpiresAt.Time.Format(time.RFC3339),
		ArtifactReady:  false,
	}, nil
}

func (s *Service) DownloadGuestSharedArtifact(ctx context.Context, rawToken, ipHash string) (string, []byte, error) {
	g, err := s.resolveValidShareGrant(ctx, rawToken)
	if err != nil {
		return "", nil, err
	}
	var art db.DocumentArtifact
	if g.ArtifactID.Valid {
		art, err = s.queries.GetDocumentArtifactByID(ctx, db.GetDocumentArtifactByIDParams{ID: g.ArtifactID.Int64, WorkspaceID: g.WorkspaceID})
	} else {
		art, err = s.queries.GetLatestDocumentArtifact(ctx, db.GetLatestDocumentArtifactParams{
			WorkspaceID: g.WorkspaceID, DocumentType: g.ResourceType, DocumentID: g.ResourceID,
		})
	}
	if err != nil || len(art.PdfBytes) == 0 {
		// Render on demand if missing
		res, rErr := s.RenderDocumentArtifact(ctx, g.WorkspaceID, 0, g.ResourceType, g.ResourceID, fmt.Sprintf("guest-dl-%d-%d", g.ID, time.Now().Unix()))
		if rErr != nil {
			return "", nil, ErrShareUnavailable
		}
		art = res.Artifact
	}
	_ = s.queries.RecordShareAccessCounter(ctx, db.RecordShareAccessCounterParams{ID: g.ID, Column2: "downloaded"})
	_, _ = s.queries.CreateShareAccessEvent(ctx, db.CreateShareAccessEventParams{
		ShareGrantID: pgtype.Int8{Int64: g.ID, Valid: true},
		WorkspaceID:  pgtype.Int8{Int64: g.WorkspaceID, Valid: true},
		EventType:    "downloaded",
		IpHash:       ipHash,
	})
	return fmt.Sprintf("%s-%d-v%d.pdf", g.ResourceType, g.ResourceID, art.Version), art.PdfBytes, nil
}

// CreateWhatsAppHandoff creates a narrow guest share grant and prepares a user-initiated WhatsApp deep link.
// Never records message_sent or delivered; records handoff_opened only.
func (s *Service) CreateWhatsAppHandoff(ctx context.Context, workspaceID, userID int64, docType string, docID int64) (WhatsAppHandoffResult, error) {
	snap, err := s.buildImmutableDocumentSnapshot(ctx, workspaceID, docType, docID)
	if err != nil {
		return WhatsAppHandoffResult{}, err
	}
	created, err := s.CreateShareGrant(ctx, workspaceID, userID, docType, docID, CreateShareGrantInput{
		Purpose:        "whatsapp_handoff",
		ExpiresInHours: 24 * 7,
	})
	if err != nil {
		return WhatsAppHandoffResult{}, err
	}

	msg := fmt.Sprintf("Hello from %s. Please view %s %s securely here (expires in 7 days): %s",
		snap.SenderName, strings.ToUpper(snap.DocumentType), snap.DocumentNumber, created.ShareURL)
	waLink := "https://wa.me/?text=" + url.QueryEscape(msg)

	_, _ = s.queries.CreateDelivery(ctx, db.CreateDeliveryParams{
		WorkspaceID:     workspaceID,
		DocumentType:    docType,
		DocumentID:      docID,
		ShareGrantID:    pgtype.Int8{Int64: created.Grant.ID, Valid: true},
		Channel:         "whatsapp_handoff",
		TemplateKey:     "whatsapp_handoff",
		TemplateVersion: "v1",
		Status:          "handoff_opened",
		Provider:        "whatsapp_link",
		IdempotencyKey:  fmt.Sprintf("wa-%d-%d-%d", workspaceID, created.Grant.ID, time.Now().UnixNano()),
		Attempts:        1,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	_, _ = s.queries.CreateShareAccessEvent(ctx, db.CreateShareAccessEventParams{
		ShareGrantID: pgtype.Int8{Int64: created.Grant.ID, Valid: true},
		WorkspaceID:  pgtype.Int8{Int64: workspaceID, Valid: true},
		EventType:    "handoff_opened",
	})

	return WhatsAppHandoffResult{
		Grant:        created.Grant,
		ShareURL:     created.ShareURL,
		MessageText:  msg,
		WhatsAppLink: waLink,
		Status:       "handoff_opened",
		Disclosure:   "Anything you send through WhatsApp leaves Rekordly's controlled environment.",
	}, nil
}

// ==================== Email Deliveries, Retry, Resend & Webhooks ====================

func (s *Service) CreateEmailDelivery(ctx context.Context, workspaceID, userID int64, docType string, docID int64, idempKey string, in CreateDeliveryInput) (db.Delivery, error) {
	emailAddr, err := notify.ValidateEmailAddress(in.RecipientEmail)
	if err != nil {
		return db.Delivery{}, err
	}
	if idempKey == "" {
		idempKey = fmt.Sprintf("deliv-%d-%s-%d-%d", workspaceID, docType, docID, time.Now().UnixNano())
	}
	if existing, err := s.queries.GetDeliveryByIdemp(ctx, db.GetDeliveryByIdempParams{
		WorkspaceID:    workspaceID,
		IdempotencyKey: idempKey,
	}); err == nil {
		return existing, nil
	}

	digest := hashOpaqueToken(emailAddr)
	if _, supErr := s.queries.IsEmailSuppressed(ctx, db.IsEmailSuppressedParams{
		WorkspaceID: workspaceID,
		EmailDigest: digest,
	}); supErr == nil {
		return db.Delivery{}, ErrEmailSuppressed
	}

	snap, err := s.buildImmutableDocumentSnapshot(ctx, workspaceID, docType, docID)
	if err != nil {
		return db.Delivery{}, err
	}
	share, err := s.CreateShareGrant(ctx, workspaceID, userID, docType, docID, CreateShareGrantInput{
		ArtifactID:     in.ArtifactID,
		Purpose:        "email_delivery",
		ExpiresInHours: 24 * 14,
	})
	if err != nil {
		return db.Delivery{}, err
	}

	tplKey := strings.TrimSpace(in.TemplateKey)
	if tplKey == "" {
		tplKey = "document_share"
	}
	var artID, resendOf pgtype.Int8
	if in.ArtifactID != nil {
		artID = pgtype.Int8{Int64: *in.ArtifactID, Valid: true}
	}
	if in.ResendOfID != nil {
		resendOf = pgtype.Int8{Int64: *in.ResendOfID, Valid: true}
	}

	deliv, err := s.queries.CreateDelivery(ctx, db.CreateDeliveryParams{
		WorkspaceID:        workspaceID,
		DocumentType:       docType,
		DocumentID:         docID,
		ArtifactID:         artID,
		ShareGrantID:       pgtype.Int8{Int64: share.Grant.ID, Valid: true},
		Channel:            "email",
		RecipientMasked:    maskEmail(emailAddr),
		RecipientDigest:    digest,
		TemplateKey:        tplKey,
		TemplateVersion:    "v1",
		Status:             "queued",
		Provider:           "resend",
		IdempotencyKey:     idempKey,
		IsResend:           in.IsResend,
		ResendOfDeliveryID: resendOf,
		CreatedByUserID:    pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return db.Delivery{}, err
	}

	subject, textBody, htmlBody := notify.RenderSafeDocumentEmail(
		tplKey, snap.SenderName, snap.DocumentType, snap.DocumentNumber, share.ShareURL, "Link expires in 14 days.",
	)
	return s.dispatchEmailDelivery(ctx, deliv, emailAddr, in.ReplyTo, subject, textBody, htmlBody)
}

func (s *Service) dispatchEmailDelivery(ctx context.Context, deliv db.Delivery, toEmail, replyTo, subject, textBody, htmlBody string) (db.Delivery, error) {
	if s.emailProvider == nil || !s.emailProvider.IsConfigured() {
		_, _ = s.queries.CreateDeliveryAttempt(ctx, db.CreateDeliveryAttemptParams{
			DeliveryID: deliv.ID, WorkspaceID: deliv.WorkspaceID, AttemptNumber: deliv.Attempts + 1,
			Status: "retry_scheduled", ErrorClass: "provider_unavailable", ErrorMessage: "email provider not configured", Retryable: true,
		})
		return s.queries.UpdateDeliveryStatus(ctx, db.UpdateDeliveryStatusParams{
			ID: deliv.ID, WorkspaceID: deliv.WorkspaceID, Status: "retry_scheduled",
			Attempts: deliv.Attempts + 1, LastErrorClass: "provider_unavailable", LastErrorMessage: "email provider not configured",
		})
	}

	res, err := s.emailProvider.SendEmail(ctx, notify.SendEmailRequest{
		To:             toEmail,
		ReplyTo:        replyTo,
		Subject:        subject,
		TextBody:       textBody,
		HTMLBody:       htmlBody,
		IdempotencyKey: deliv.IdempotencyKey,
	})
	if err != nil {
		retryable := errors.Is(err, notify.ErrEmailTransient)
		newStatus := "failed"
		if retryable {
			newStatus = "retry_scheduled"
		}
		_, _ = s.queries.CreateDeliveryAttempt(ctx, db.CreateDeliveryAttemptParams{
			DeliveryID: deliv.ID, WorkspaceID: deliv.WorkspaceID, AttemptNumber: deliv.Attempts + 1,
			Status: newStatus, ErrorClass: err.Error(), ErrorMessage: err.Error(), Retryable: retryable,
		})
		return s.queries.UpdateDeliveryStatus(ctx, db.UpdateDeliveryStatusParams{
			ID: deliv.ID, WorkspaceID: deliv.WorkspaceID, Status: newStatus,
			Attempts: deliv.Attempts + 1, LastErrorClass: err.Error(), LastErrorMessage: err.Error(),
		})
	}

	// "accepted" means provider accepted responsibility, NEVER "delivered" or "opened".
	_, _ = s.queries.CreateDeliveryAttempt(ctx, db.CreateDeliveryAttemptParams{
		DeliveryID: deliv.ID, WorkspaceID: deliv.WorkspaceID, AttemptNumber: deliv.Attempts + 1,
		Status: "accepted", ProviderMessageID: res.ProviderMessageID,
	})
	return s.queries.UpdateDeliveryStatus(ctx, db.UpdateDeliveryStatusParams{
		ID: deliv.ID, WorkspaceID: deliv.WorkspaceID, Status: "accepted",
		Column4: res.ProviderMessageID, Attempts: deliv.Attempts + 1,
	})
}

func (s *Service) ListDeliveriesByDocument(ctx context.Context, workspaceID int64, docType string, docID int64) ([]db.Delivery, error) {
	return s.queries.ListDeliveriesByDocument(ctx, db.ListDeliveriesByDocumentParams{
		WorkspaceID:  workspaceID,
		DocumentType: strings.ToLower(strings.TrimSpace(docType)),
		DocumentID:   docID,
	})
}

func (s *Service) GetDelivery(ctx context.Context, workspaceID, deliveryID int64) (db.Delivery, error) {
	d, err := s.queries.GetDeliveryByID(ctx, db.GetDeliveryByIDParams{ID: deliveryID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.Delivery{}, ErrNotFound
	}
	return d, err
}

func (s *Service) RetryEmailDelivery(ctx context.Context, workspaceID, deliveryID int64) (db.Delivery, error) {
	d, err := s.queries.GetDeliveryByID(ctx, db.GetDeliveryByIDParams{ID: deliveryID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.Delivery{}, ErrNotFound
	}
	if err != nil {
		return db.Delivery{}, err
	}
	if d.Status != "retry_scheduled" && d.Status != "queued" {
		return db.Delivery{}, ErrDeliveryNotRetry
	}
	// Ambiguous timeout-after-send reconciliation: check provider status before retrying
	if d.ProviderMessageID != "" && s.emailProvider != nil && s.emailProvider.IsConfigured() {
		if st, sErr := s.emailProvider.GetEmailStatus(ctx, d.ProviderMessageID); sErr == nil && (st == "delivered" || st == "sent") {
			target := "accepted"
			if st == "delivered" {
				target = "delivered"
			}
			return s.queries.UpdateDeliveryStatus(ctx, db.UpdateDeliveryStatusParams{
				ID: d.ID, WorkspaceID: workspaceID, Status: target, Attempts: d.Attempts,
			})
		}
	}
	return d, nil
}

func (s *Service) ProcessEmailWebhook(ctx context.Context, rawBody []byte, sigHeader string) (string, error) {
	if s.emailProvider != nil && !s.emailProvider.VerifyWebhookSignature(rawBody, sigHeader) {
		return "", notify.ErrInvalidEmailWebhook
	}
	var evt struct {
		Type string `json:"type"`
		Data struct {
			EmailID string   `json:"email_id"`
			To      []string `json:"to"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &evt); err != nil || evt.Type == "" {
		return "", errors.New("invalid email webhook payload")
	}
	eventID := evt.Type + ":" + evt.Data.EmailID
	evRow, err := s.queries.CreateEmailWebhookEvent(ctx, db.CreateEmailWebhookEventParams{
		Provider:          "resend",
		EventID:           eventID,
		EventType:         evt.Type,
		ProviderMessageID: evt.Data.EmailID,
		SignatureValid:    true,
		EventOccurredAt:   pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		ProcessingState:   "processed",
	})
	if isNoRows(err) {
		return "duplicate_ignored", nil
	}
	if err != nil {
		return "", err
	}
	_ = evRow

	deliv, dErr := s.queries.GetDeliveryByProviderMsgID(ctx, evt.Data.EmailID)
	if dErr != nil {
		return "processed_unlinked", nil
	}

	switch evt.Type {
	case "email.delivered":
		_, _ = s.queries.UpdateDeliveryStatus(ctx, db.UpdateDeliveryStatusParams{
			ID: deliv.ID, WorkspaceID: deliv.WorkspaceID, Status: "delivered", Attempts: deliv.Attempts,
		})
	case "email.opened":
		if deliv.Status == "delivered" || deliv.Status == "accepted" {
			_, _ = s.queries.UpdateDeliveryStatus(ctx, db.UpdateDeliveryStatusParams{
				ID: deliv.ID, WorkspaceID: deliv.WorkspaceID, Status: "opened", Attempts: deliv.Attempts,
			})
		}
	case "email.bounced":
		_, _ = s.queries.UpdateDeliveryStatus(ctx, db.UpdateDeliveryStatusParams{
			ID: deliv.ID, WorkspaceID: deliv.WorkspaceID, Status: "bounced", Attempts: deliv.Attempts, LastErrorClass: "hard_bounce",
		})
		_, _ = s.queries.UpsertEmailSuppression(ctx, db.UpsertEmailSuppressionParams{
			WorkspaceID: deliv.WorkspaceID, EmailDigest: deliv.RecipientDigest, EmailMasked: deliv.RecipientMasked,
			Reason: "hard_bounce", ProviderEventID: eventID,
		})
	case "email.complained":
		_, _ = s.queries.UpdateDeliveryStatus(ctx, db.UpdateDeliveryStatusParams{
			ID: deliv.ID, WorkspaceID: deliv.WorkspaceID, Status: "complained", Attempts: deliv.Attempts, LastErrorClass: "complaint",
		})
		_, _ = s.queries.UpsertEmailSuppression(ctx, db.UpsertEmailSuppressionParams{
			WorkspaceID: deliv.WorkspaceID, EmailDigest: deliv.RecipientDigest, EmailMasked: deliv.RecipientMasked,
			Reason: "complaint", ProviderEventID: eventID,
		})
	}
	return "processed", nil
}
