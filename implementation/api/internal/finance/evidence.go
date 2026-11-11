package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha1" // Cloudinary signed-upload protocol requires SHA-1.
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrEvidenceUnavailable = errors.New("private evidence uploads are not configured")
	ErrEvidenceType        = errors.New("file type is not allowed for financial evidence")
	ErrEvidenceSize        = errors.New("file exceeds the evidence size limit")
	ErrEvidenceAsset       = errors.New("evidence asset is outside the authorized private folder")
)

const maxEvidenceBytes int64 = 10 * 1024 * 1024

type CloudinaryEvidenceConfig struct {
	CloudName       string
	APIKey          string
	APISecret       string
	AdminAPIBaseURL string // test-only override; production uses Cloudinary's HTTPS API.
}

type EvidenceUploadAuthorizer interface {
	Authorize(workspaceID, draftID int64, fileName, mimeType string, sizeBytes int64) (EvidenceUploadAuthorization, error)
	Verify(ctx context.Context, assetID string) (VerifiedEvidenceAsset, error)
	DownloadURL(assetID, mimeType string, expiresAt time.Time) (EvidenceAccess, error)
}

type EvidenceUploadAuthorization struct {
	Provider     string `json:"provider"`
	UploadURL    string `json:"upload_url"`
	APIKey       string `json:"api_key"`
	Timestamp    string `json:"timestamp"`
	Signature    string `json:"signature"`
	Folder       string `json:"folder"`
	PublicID     string `json:"public_id"`
	DeliveryType string `json:"type"`
	ResourceType string `json:"resource_type"`
	MaxBytes     string `json:"max_bytes"`
	ExpiresAt    string `json:"expires_at"`
}

type EvidenceRegistrationInput struct {
	AssetID    string `json:"asset_id" binding:"required"`
	FileName   string `json:"file_name" binding:"required"`
	SizeBytes  string `json:"size_bytes" binding:"required"`
	MimeType   string `json:"mime_type" binding:"required"`
	SHA256Hash string `json:"sha256_hash"`
}

// EvidenceAccess is a short-lived Cloudinary download URL. It is issued only
// after Rekordly authorizes the requesting workspace; it is never persisted.
type EvidenceAccess struct {
	URL       string `json:"url"`
	ExpiresAt string `json:"expires_at"`
}

type VerifiedEvidenceAsset struct {
	AssetID  string
	Bytes    int64
	MimeType string
}

type cloudinaryEvidenceAuthorizer struct {
	config CloudinaryEvidenceConfig
	client *http.Client
}

func NewCloudinaryEvidenceAuthorizer(config CloudinaryEvidenceConfig) EvidenceUploadAuthorizer {
	if strings.TrimSpace(config.CloudName) == "" || strings.TrimSpace(config.APIKey) == "" || strings.TrimSpace(config.APISecret) == "" {
		return nil
	}
	return &cloudinaryEvidenceAuthorizer{config: config, client: &http.Client{Timeout: 10 * time.Second}}
}

func (a *cloudinaryEvidenceAuthorizer) Verify(ctx context.Context, assetID string) (VerifiedEvidenceAsset, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(a.config.AdminAPIBaseURL), "/")
	if baseURL == "" {
		baseURL = fmt.Sprintf("https://api.cloudinary.com/v1_1/%s", url.PathEscape(a.config.CloudName))
	}
	requestURL := baseURL + "/resources/auto/authenticated/" + url.PathEscape(assetID)
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, requestURL, nil)
	if err != nil {
		return VerifiedEvidenceAsset{}, err
	}
	request.SetBasicAuth(a.config.APIKey, a.config.APISecret)
	response, err := a.client.Do(request)
	if err != nil {
		return VerifiedEvidenceAsset{}, fmt.Errorf("verify private evidence asset: %w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 64*1024))
	if err != nil {
		return VerifiedEvidenceAsset{}, err
	}
	if response.StatusCode == http.StatusNotFound {
		return VerifiedEvidenceAsset{}, ErrEvidenceAsset
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return VerifiedEvidenceAsset{}, fmt.Errorf("verify private evidence asset: provider returned %d", response.StatusCode)
	}
	var result struct {
		PublicID     string `json:"public_id"`
		Bytes        int64  `json:"bytes"`
		Format       string `json:"format"`
		ResourceType string `json:"resource_type"`
		Type         string `json:"type"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return VerifiedEvidenceAsset{}, fmt.Errorf("decode private evidence metadata: %w", err)
	}
	if result.PublicID != assetID || result.Type != "authenticated" || result.Bytes <= 0 {
		return VerifiedEvidenceAsset{}, ErrEvidenceAsset
	}
	return VerifiedEvidenceAsset{AssetID: result.PublicID, Bytes: result.Bytes, MimeType: mimeTypeFromCloudinary(result.ResourceType, result.Format)}, nil
}

func mimeTypeFromCloudinary(resourceType, format string) string {
	format = strings.ToLower(strings.TrimSpace(format))
	if resourceType == "image" {
		switch format {
		case "jpg", "jpeg":
			return "image/jpeg"
		case "png":
			return "image/png"
		case "webp":
			return "image/webp"
		}
	}
	if format == "pdf" {
		return "application/pdf"
	}
	return ""
}

func (a *cloudinaryEvidenceAuthorizer) Authorize(workspaceID, draftID int64, fileName, mimeType string, sizeBytes int64) (EvidenceUploadAuthorization, error) {
	if err := validateEvidenceIntent(fileName, mimeType, sizeBytes); err != nil {
		return EvidenceUploadAuthorization{}, err
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return EvidenceUploadAuthorization{}, err
	}
	folder := fmt.Sprintf("rekordly/evidence/w%d/d%d", workspaceID, draftID)
	publicID := hex.EncodeToString(nonce)
	timestamp := strconv.FormatInt(time.Now().UTC().Unix(), 10)
	params := map[string]string{"folder": folder, "public_id": publicID, "timestamp": timestamp, "type": "authenticated"}
	signature := cloudinarySignature(params, a.config.APISecret)
	return EvidenceUploadAuthorization{
		Provider: "cloudinary", UploadURL: fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/auto/upload", a.config.CloudName), APIKey: a.config.APIKey,
		Timestamp: timestamp, Signature: signature, Folder: folder, PublicID: publicID, DeliveryType: "authenticated", ResourceType: "auto",
		MaxBytes: strconv.FormatInt(maxEvidenceBytes, 10), ExpiresAt: time.Now().UTC().Add(10 * time.Minute).Format(time.RFC3339),
	}, nil
}

func (a *cloudinaryEvidenceAuthorizer) DownloadURL(assetID, mimeType string, expiresAt time.Time) (EvidenceAccess, error) {
	if strings.TrimSpace(assetID) == "" || strings.Contains(assetID, "..") {
		return EvidenceAccess{}, ErrEvidenceAsset
	}
	format, resourceType, ok := evidenceDeliveryType(mimeType)
	if !ok {
		return EvidenceAccess{}, ErrEvidenceType
	}
	timestamp := strconv.FormatInt(time.Now().UTC().Unix(), 10)
	params := map[string]string{
		"expires_at": strconv.FormatInt(expiresAt.UTC().Unix(), 10),
		"format":     format,
		"public_id":  assetID,
		"timestamp":  timestamp,
		"type":       "authenticated",
	}
	values := url.Values{}
	for key, value := range params {
		values.Set(key, value)
	}
	values.Set("api_key", a.config.APIKey)
	values.Set("signature", cloudinarySignature(params, a.config.APISecret))
	return EvidenceAccess{
		URL:       fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/%s/download?%s", url.PathEscape(a.config.CloudName), resourceType, values.Encode()),
		ExpiresAt: expiresAt.UTC().Format(time.RFC3339),
	}, nil
}

func evidenceDeliveryType(mimeType string) (format, resourceType string, ok bool) {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/jpeg":
		return "jpg", "image", true
	case "image/png":
		return "png", "image", true
	case "image/webp":
		return "webp", "image", true
	case "application/pdf":
		return "pdf", "image", true
	default:
		return "", "", false
	}
}

func cloudinarySignature(params map[string]string, secret string) string {
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+params[key])
	}
	digest := sha1.Sum([]byte(strings.Join(parts, "&") + secret))
	return hex.EncodeToString(digest[:])
}

func validateEvidenceIntent(fileName, mimeType string, sizeBytes int64) error {
	if strings.TrimSpace(fileName) == "" || filepath.Base(fileName) != fileName {
		return ErrEvidenceType
	}
	if sizeBytes <= 0 || sizeBytes > maxEvidenceBytes {
		return ErrEvidenceSize
	}
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "application/pdf", "image/jpeg", "image/png", "image/webp":
		return nil
	default:
		return ErrEvidenceType
	}
}

func (s *Service) AuthorizeEvidenceUpload(ctx context.Context, workspaceID, userID, draftID int64, fileName, mimeType string, sizeBytes int64) (EvidenceUploadAuthorization, error) {
	if s.evidenceUploader == nil {
		return EvidenceUploadAuthorization{}, ErrEvidenceUnavailable
	}
	draft, err := s.queries.GetMoneyRecordDraft(ctx, db.GetMoneyRecordDraftParams{ID: draftID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return EvidenceUploadAuthorization{}, ErrNotFound
	}
	if err != nil {
		return EvidenceUploadAuthorization{}, err
	}
	if draft.CreatedByUserID != userID {
		return EvidenceUploadAuthorization{}, ErrDraftNotOwned
	}
	if draft.State != "saved" && draft.State != "needs_review" && draft.State != "failed" {
		return EvidenceUploadAuthorization{}, ErrDraftNotEditable
	}
	return s.evidenceUploader.Authorize(workspaceID, draftID, fileName, mimeType, sizeBytes)
}

func (s *Service) RegisterEvidenceAsset(ctx context.Context, workspaceID, userID, draftID int64, in EvidenceRegistrationInput) (db.EvidenceAsset, error) {
	if s.evidenceUploader == nil {
		return db.EvidenceAsset{}, ErrEvidenceUnavailable
	}
	draft, err := s.queries.GetMoneyRecordDraft(ctx, db.GetMoneyRecordDraftParams{ID: draftID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.EvidenceAsset{}, ErrNotFound
	}
	if err != nil {
		return db.EvidenceAsset{}, err
	}
	if draft.CreatedByUserID != userID {
		return db.EvidenceAsset{}, ErrDraftNotOwned
	}
	if draft.State != "saved" && draft.State != "needs_review" && draft.State != "failed" {
		return db.EvidenceAsset{}, ErrDraftNotEditable
	}
	sizeBytes, err := parseDraftAmount("", in.SizeBytes, 0)
	if err != nil {
		return db.EvidenceAsset{}, err
	}
	if err := validateEvidenceIntent(in.FileName, in.MimeType, sizeBytes); err != nil {
		return db.EvidenceAsset{}, err
	}
	assetID := strings.TrimSpace(in.AssetID)
	prefix := fmt.Sprintf("rekordly/evidence/w%d/d%d/", workspaceID, draftID)
	if !strings.HasPrefix(assetID, prefix) || strings.Contains(assetID, "..") {
		return db.EvidenceAsset{}, ErrEvidenceAsset
	}
	verified, err := s.evidenceUploader.Verify(ctx, assetID)
	if err != nil {
		return db.EvidenceAsset{}, err
	}
	if verified.Bytes != sizeBytes || verified.MimeType != strings.ToLower(strings.TrimSpace(in.MimeType)) {
		return db.EvidenceAsset{}, ErrEvidenceAsset
	}
	return s.queries.CreateEvidenceAsset(ctx, db.CreateEvidenceAssetParams{
		WorkspaceID: workspaceID, DraftID: pgtype.Int8{Int64: draftID, Valid: true}, UploadedByUserID: pgtype.Int8{Int64: userID, Valid: true},
		StorageProvider: "cloudinary", AssetID: assetID, DeliveryType: "authenticated", OriginalFileName: filepath.Base(in.FileName), ByteSize: sizeBytes,
		MimeType: verified.MimeType, Sha256Hash: optionalPgText(in.SHA256Hash), Status: "verified",
	})
}

func (s *Service) GetEvidenceAccess(ctx context.Context, workspaceID, evidenceID int64) (EvidenceAccess, error) {
	if s.evidenceUploader == nil {
		return EvidenceAccess{}, ErrEvidenceUnavailable
	}
	asset, err := s.queries.GetVerifiedEvidenceAssetByID(ctx, db.GetVerifiedEvidenceAssetByIDParams{WorkspaceID: workspaceID, ID: evidenceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return EvidenceAccess{}, ErrNotFound
	}
	if err != nil {
		return EvidenceAccess{}, err
	}
	return s.evidenceUploader.DownloadURL(asset.AssetID, asset.MimeType, time.Now().UTC().Add(5*time.Minute))
}
