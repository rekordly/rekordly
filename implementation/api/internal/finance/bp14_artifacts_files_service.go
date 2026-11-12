package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/storage"
)

var (
	ErrFileQuarantined      = errors.New("FILE_QUARANTINED")
	ErrFilePublicDisallowed = errors.New("PUBLIC_DELIVERY_DISALLOWED_FOR_SENSITIVE_FILE")
	ErrFileStillLinked      = errors.New("FILE_STILL_LINKED")
)

type RenderDocumentResult struct {
	Artifact  db.DocumentArtifact `json:"artifact"`
	RenderJob db.RenderJob        `json:"render_job"`
}

type UploadIntentInput struct {
	Filename  string `json:"filename" binding:"required"`
	MimeType  string `json:"mime_type" binding:"required"`
	ByteSize  int64  `json:"byte_size" binding:"required"`
	FileClass string `json:"file_class"` // private_evidence, public_media, temporary_upload, export_archive
}

type UploadIntentResult struct {
	File          db.File                      `json:"file"`
	Authorization *EvidenceUploadAuthorization `json:"authorization,omitempty"`
}

type FinalizeFileUploadInput struct {
	SHA256Hash      string `json:"sha256_hash"`
	ProviderVersion string `json:"provider_version"`
	Quarantine      bool   `json:"quarantine"`
}

// RenderDocumentArtifact creates an immutable snapshot + deterministic PDF artifact.
// Historical artifacts are never mutated when catalogue/names/logos change later.
func (s *Service) RenderDocumentArtifact(ctx context.Context, workspaceID, userID int64, docType string, docID int64, idempKey string) (RenderDocumentResult, error) {
	docType = strings.ToLower(strings.TrimSpace(docType))
	if idempKey == "" {
		idempKey = fmt.Sprintf("render-%d-%s-%d", workspaceID, docType, docID)
	}
	if existingJob, err := s.queries.GetRenderJobByIdemp(ctx, db.GetRenderJobByIdempParams{
		WorkspaceID:    workspaceID,
		IdempotencyKey: idempKey,
	}); err == nil {
		art, _ := s.queries.GetDocumentArtifactByID(ctx, db.GetDocumentArtifactByIDParams{ID: existingJob.ArtifactID, WorkspaceID: workspaceID})
		return RenderDocumentResult{Artifact: art, RenderJob: existingJob}, nil
	}

	snap, err := s.buildImmutableDocumentSnapshot(ctx, workspaceID, docType, docID)
	if err != nil {
		return RenderDocumentResult{}, err
	}
	prev, prevErr := s.queries.GetLatestDocumentArtifact(ctx, db.GetLatestDocumentArtifactParams{
		WorkspaceID:  workspaceID,
		DocumentType: docType,
		DocumentID:   docID,
	})
	nextVer := int32(1)
	if prevErr == nil {
		nextVer = prev.Version + 1
	}
	snap.Version = nextVer

	snapJSON, _ := json.Marshal(snap)
	snapSum := sha256.Sum256(snapJSON)
	snapHash := hex.EncodeToString(snapSum[:])

	pdfBytes, pdfHash, pageCount, err := storage.GenerateDocumentPDF(snap)
	if err != nil {
		return RenderDocumentResult{}, err
	}

	art, err := s.queries.CreateDocumentArtifact(ctx, db.CreateDocumentArtifactParams{
		WorkspaceID:         workspaceID,
		DocumentType:        docType,
		DocumentID:          docID,
		Version:             nextVer,
		RenderSchemaVersion: snap.RenderSchemaVersion,
		SnapshotJson:        snapJSON,
		SnapshotHash:        snapHash,
		PdfBytes:            pdfBytes,
		PdfHash:             pdfHash,
		ByteSize:            int64(len(pdfBytes)),
		PageCount:           int32(pageCount),
		Status:              "ready",
		CreatedByUserID:     pgtype.Int8{Int64: userID, Valid: userID > 0},
	})
	if err != nil {
		return RenderDocumentResult{}, err
	}
	if prevErr == nil {
		_ = s.queries.SupersedeDocumentArtifact(ctx, db.SupersedeDocumentArtifactParams{
			ID:             prev.ID,
			WorkspaceID:    workspaceID,
			SupersededByID: pgtype.Int8{Int64: art.ID, Valid: true},
		})
	}

	job, err := s.queries.CreateRenderJob(ctx, db.CreateRenderJobParams{
		WorkspaceID:    workspaceID,
		ArtifactID:     art.ID,
		DocumentType:   docType,
		DocumentID:     docID,
		IdempotencyKey: idempKey,
		Status:         "ready",
		Attempts:       1,
		FinishedAt:     pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
	if err != nil {
		return RenderDocumentResult{}, err
	}
	return RenderDocumentResult{Artifact: art, RenderJob: job}, nil
}

func (s *Service) GetRenderJob(ctx context.Context, workspaceID, jobID int64) (db.RenderJob, error) {
	j, err := s.queries.GetRenderJobByID(ctx, db.GetRenderJobByIDParams{ID: jobID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.RenderJob{}, ErrNotFound
	}
	return j, err
}

func (s *Service) GetDocumentArtifact(ctx context.Context, workspaceID, artifactID int64) (db.DocumentArtifact, error) {
	a, err := s.queries.GetDocumentArtifactByID(ctx, db.GetDocumentArtifactByIDParams{ID: artifactID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.DocumentArtifact{}, ErrNotFound
	}
	return a, err
}

func (s *Service) buildImmutableDocumentSnapshot(ctx context.Context, workspaceID int64, docType string, docID int64) (storage.DocumentSnapshot, error) {
	var wsName string
	if err := s.pool.QueryRow(ctx, `SELECT name FROM workspaces WHERE id = $1`, workspaceID).Scan(&wsName); err != nil {
		return storage.DocumentSnapshot{}, ErrNotFound
	}
	snap := storage.DocumentSnapshot{
		DocumentType:        docType,
		DocumentNumber:      fmt.Sprintf("%s-%d", strings.ToUpper(docType), docID),
		DocumentDate:        time.Now().UTC().Format("2006-01-02"),
		Status:              "issued",
		Version:             1,
		SenderName:          wsName,
		RecipientName:       "Customer / Counterparty",
		Currency:            "NGN",
		SubtotalDisplay:     "0.00",
		TaxDisplay:          "0.00",
		TotalDisplay:        "0.00",
		PaymentState:        "unpaid",
		DisclosureText:      "Generated from immutable Rekordly snapshot.",
		RenderSchemaVersion: "pdf-snapshot.v1",
	}

	switch docType {
	case "invoice":
		var num, status, cur string
		var totalMinor, paidMinor, taxMinor int64
		var cpName string
		err := s.pool.QueryRow(ctx, `
			SELECT i.invoice_number, i.status, i.currency, i.total_amount_minor, i.paid_amount_minor, i.tax_amount_minor, COALESCE(c.name, 'Customer')
			FROM invoices i LEFT JOIN counterparties c ON c.id = i.customer_id
			WHERE i.id = $1 AND i.workspace_id = $2`, docID, workspaceID).
			Scan(&num, &status, &cur, &totalMinor, &paidMinor, &taxMinor, &cpName)
		if err != nil {
			return storage.DocumentSnapshot{}, ErrNotFound
		}
		snap.DocumentNumber = num
		snap.Status = status
		snap.Currency = cur
		snap.RecipientName = cpName
		snap.SubtotalDisplay = formatMinorPlain(totalMinor-taxMinor, CurrencyExponent(cur))
		snap.TaxDisplay = formatMinorPlain(taxMinor, CurrencyExponent(cur))
		snap.TotalDisplay = formatMinorPlain(totalMinor, CurrencyExponent(cur))
		if paidMinor >= totalMinor && totalMinor > 0 {
			snap.PaymentState = "paid"
		} else if paidMinor > 0 {
			snap.PaymentState = "partially_paid"
		}
		rows, _ := s.pool.Query(ctx, `SELECT description, quantity, line_total_minor FROM invoice_items WHERE invoice_id = $1 ORDER BY id ASC`, docID)
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var desc string
				var qty string
				var lineMinor int64
				if rows.Scan(&desc, &qty, &lineMinor) == nil {
					snap.Lines = append(snap.Lines, struct {
						Description string `json:"description"`
						Quantity    string `json:"quantity"`
						Amount      string `json:"amount"`
					}{Description: desc, Quantity: qty, Amount: formatMinorPlain(lineMinor, CurrencyExponent(cur))})
				}
			}
		}
	case "estimate":
		var num, status, cur string
		var totalMinor int64
		err := s.pool.QueryRow(ctx, `SELECT estimate_number, status, currency, total_amount_minor FROM estimates WHERE id = $1 AND workspace_id = $2`,
			docID, workspaceID).Scan(&num, &status, &cur, &totalMinor)
		if err != nil {
			return storage.DocumentSnapshot{}, ErrNotFound
		}
		snap.DocumentNumber = num
		snap.Status = status
		snap.Currency = cur
		snap.TotalDisplay = formatMinorPlain(totalMinor, CurrencyExponent(cur))
	case "purchase_order":
		var num, status, cur string
		var totalMinor int64
		err := s.pool.QueryRow(ctx, `SELECT po_number, status, currency, total_minor FROM purchase_orders WHERE id = $1 AND workspace_id = $2`,
			docID, workspaceID).Scan(&num, &status, &cur, &totalMinor)
		if err != nil {
			return storage.DocumentSnapshot{}, ErrNotFound
		}
		snap.DocumentNumber = num
		snap.Status = status
		snap.Currency = cur
		snap.TotalDisplay = formatMinorPlain(totalMinor, CurrencyExponent(cur))
	}
	return snap, nil
}

func formatMinorPlain(minor int64, exp int) string {
	div := int64(1)
	for i := 0; i < exp; i++ {
		div *= 10
	}
	whole := minor / div
	frac := minor % div
	if frac < 0 {
		frac = -frac
	}
	if exp == 0 {
		return strconv.FormatInt(whole, 10)
	}
	return fmt.Sprintf("%d.%0*d", whole, exp, frac)
}

// ==================== Files & Private Evidence ====================

func (s *Service) CreateFileUploadIntent(ctx context.Context, workspaceID, userID int64, in UploadIntentInput) (UploadIntentResult, error) {
	fileClass := strings.ToLower(strings.TrimSpace(in.FileClass))
	if fileClass == "" {
		fileClass = "private_evidence"
	}
	// Security rule: sensitive evidence/artifacts must NEVER use public_media / ordinary upload delivery.
	if fileClass == "public_media" && (strings.Contains(strings.ToLower(in.Filename), "invoice") || strings.Contains(strings.ToLower(in.Filename), "receipt") || strings.Contains(strings.ToLower(in.Filename), "statement")) {
		return UploadIntentResult{}, ErrFilePublicDisallowed
	}

	safeName := filepath.Base(strings.TrimSpace(in.Filename))
	if safeName == "" || safeName == "." || safeName == ".." || strings.ContainsAny(in.Filename, "<>\"'\x00") || strings.Contains(in.Filename, "..") {
		return UploadIntentResult{}, ErrEvidenceType
	}
	if err := validateEvidenceIntent(safeName, in.MimeType, in.ByteSize); err != nil {
		return UploadIntentResult{}, err
	}

	// Reserve storage quota atomically before upload
	res, _, err := s.ReserveUsage(ctx, workspaceID, FeatAttachmentsStorageBytes, "file_upload", fmt.Sprintf("file-%d-%d-%d", workspaceID, userID, time.Now().UnixNano()), in.ByteSize)
	if err != nil && !errors.Is(err, ErrFeatureNotIncluded) {
		return UploadIntentResult{}, err
	}

	deliveryType := "authenticated"
	if fileClass == "public_media" {
		deliveryType = "upload"
	}
	nonce := make([]byte, 12)
	_, _ = rand.Read(nonce)
	publicID := fmt.Sprintf("rekordly/%s/w%d/%s", fileClass, workspaceID, hex.EncodeToString(nonce))

	fileRow, err := s.queries.CreateFileRecord(ctx, db.CreateFileRecordParams{
		WorkspaceID:          workspaceID,
		UploadedByUserID:     pgtype.Int8{Int64: userID, Valid: true},
		FileClass:            fileClass,
		OriginalFilename:     safeName,
		MimeType:             strings.ToLower(strings.TrimSpace(in.MimeType)),
		ByteSize:             in.ByteSize,
		Provider:             "cloudinary",
		ProviderPublicID:     publicID,
		ProviderResourceType: "auto",
		ProviderDeliveryType: deliveryType,
		ScanStatus:           "pending",
		RetentionPolicy:      "standard",
		StorageReservationID: pgtype.Int8{Int64: res.ID, Valid: res.ID > 0},
	})
	if err != nil {
		if res.ID > 0 {
			_ = s.ReleaseUsageReservation(ctx, res.BillingSubjectID, res.ID, "upload_create_failed")
		}
		return UploadIntentResult{}, err
	}

	var auth *EvidenceUploadAuthorization
	if s.evidenceUploader != nil {
		if a, aErr := s.evidenceUploader.Authorize(workspaceID, fileRow.ID, safeName, in.MimeType, in.ByteSize); aErr == nil {
			auth = &a
		}
	}
	return UploadIntentResult{File: fileRow, Authorization: auth}, nil
}

func (s *Service) FinalizeFileUpload(ctx context.Context, workspaceID, fileID int64, in FinalizeFileUploadInput) (db.File, error) {
	f, err := s.queries.GetFileByID(ctx, db.GetFileByIDParams{ID: fileID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.File{}, ErrNotFound
	}
	if err != nil {
		return db.File{}, err
	}

	scanStatus := "clean"
	if in.Quarantine {
		scanStatus = "quarantined"
	}
	updated, err := s.queries.FinalizeFileUpload(ctx, db.FinalizeFileUploadParams{
		ID:              f.ID,
		WorkspaceID:     workspaceID,
		Sha256Hash:      strings.TrimSpace(in.SHA256Hash),
		ProviderVersion: strings.TrimSpace(in.ProviderVersion),
		ScanStatus:      scanStatus,
	})
	if err != nil {
		return db.File{}, err
	}
	if f.StorageReservationID.Valid && f.StorageReservationID.Int64 > 0 {
		subj, _, sErr := s.ResolveSubjectForWorkspace(ctx, workspaceID)
		if sErr == nil {
			if scanStatus == "quarantined" {
				_ = s.ReleaseUsageReservation(ctx, subj.ID, f.StorageReservationID.Int64, "quarantined")
			} else {
				_ = s.ConsumeUsageReservation(ctx, subj.ID, f.StorageReservationID.Int64)
			}
		}
	}
	return updated, nil
}

func (s *Service) CreateFileSignedDownload(ctx context.Context, workspaceID, fileID int64) (EvidenceAccess, error) {
	f, err := s.queries.GetFileByID(ctx, db.GetFileByIDParams{ID: fileID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return EvidenceAccess{}, ErrNotFound
	}
	if err != nil {
		return EvidenceAccess{}, err
	}
	if f.ScanStatus == "quarantined" || f.FileClass == "quarantined" {
		return EvidenceAccess{}, ErrFileQuarantined
	}
	if s.evidenceUploader != nil {
		return s.evidenceUploader.DownloadURL(f.ProviderPublicID, f.MimeType, time.Now().UTC().Add(5*time.Minute))
	}
	return EvidenceAccess{
		URL:       fmt.Sprintf("/api/v1/files/%d/content?expires=%d", f.ID, time.Now().UTC().Add(5*time.Minute).Unix()),
		ExpiresAt: time.Now().UTC().Add(5 * time.Minute).Format(time.RFC3339),
	}, nil
}

func (s *Service) LinkFileToResource(ctx context.Context, workspaceID, userID, fileID int64, resourceType string, resourceID int64) (db.FileLink, error) {
	f, err := s.queries.GetFileByID(ctx, db.GetFileByIDParams{ID: fileID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.FileLink{}, ErrNotFound
	}
	if err != nil {
		return db.FileLink{}, err
	}
	if f.ScanStatus == "quarantined" {
		return db.FileLink{}, ErrFileQuarantined
	}
	return s.queries.CreateFileLink(ctx, db.CreateFileLinkParams{
		FileID:         f.ID,
		WorkspaceID:    workspaceID,
		ResourceType:   strings.ToLower(strings.TrimSpace(resourceType)),
		ResourceID:     resourceID,
		LinkedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
}

func (s *Service) UnlinkFile(ctx context.Context, workspaceID, linkID int64) (db.FileLink, error) {
	l, err := s.queries.UnlinkFileLink(ctx, db.UnlinkFileLinkParams{ID: linkID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.FileLink{}, ErrNotFound
	}
	return l, err
}

func (s *Service) RequestFileDeletion(ctx context.Context, workspaceID, userID, fileID int64) (db.File, error) {
	f, err := s.queries.GetFileByID(ctx, db.GetFileByIDParams{ID: fileID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.File{}, ErrNotFound
	}
	if err != nil {
		return db.File{}, err
	}
	linkCount, err := s.queries.CountActiveFileLinks(ctx, db.CountActiveFileLinksParams{FileID: f.ID, WorkspaceID: workspaceID})
	if err != nil {
		return db.File{}, err
	}
	if linkCount > 0 {
		return db.File{}, ErrFileStillLinked
	}

	// Revoke all share grants for this file before marking deletion scheduled
	_ = s.queries.RevokeShareGrantsForFile(ctx, db.RevokeShareGrantsForFileParams{
		WorkspaceID:     workspaceID,
		ResourceID:      f.ID,
		RevokedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	return s.queries.UpdateFileDeletionStatus(ctx, db.UpdateFileDeletionStatusParams{
		ID:             f.ID,
		WorkspaceID:    workspaceID,
		DeletionStatus: "scheduled",
	})
}

func (s *Service) ListWorkspaceFiles(ctx context.Context, workspaceID int64) ([]db.File, error) {
	return s.queries.ListFilesByWorkspace(ctx, db.ListFilesByWorkspaceParams{WorkspaceID: workspaceID, Limit: 100})
}
