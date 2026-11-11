package finance

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestCloudinaryEvidenceAuthorizationUsesAuthenticatedDelivery(t *testing.T) {
	authorizer := NewCloudinaryEvidenceAuthorizer(CloudinaryEvidenceConfig{CloudName: "demo", APIKey: "key", APISecret: "secret"})
	require.NotNil(t, authorizer)
	upload, err := authorizer.Authorize(12, 34, "receipt.pdf", "application/pdf", 1024)
	require.NoError(t, err)
	require.Equal(t, "authenticated", upload.DeliveryType)
	require.Contains(t, upload.Folder, "rekordly/evidence/w12/d34")
	require.NotEmpty(t, upload.Signature)
	require.NotEmpty(t, upload.PublicID)
}

func TestCloudinaryEvidenceDownloadURLIsShortLivedAndAuthenticated(t *testing.T) {
	authorizer := NewCloudinaryEvidenceAuthorizer(CloudinaryEvidenceConfig{CloudName: "demo", APIKey: "key", APISecret: "secret"})
	expiresAt := time.Date(2026, 11, 10, 12, 5, 0, 0, time.UTC)
	access, err := authorizer.DownloadURL("rekordly/evidence/w12/d34/asset", "application/pdf", expiresAt)
	require.NoError(t, err)
	require.Equal(t, expiresAt.Format(time.RFC3339), access.ExpiresAt)

	parsed, err := url.Parse(access.URL)
	require.NoError(t, err)
	require.Equal(t, "/v1_1/demo/image/download", parsed.Path)
	query := parsed.Query()
	require.Equal(t, "key", query.Get("api_key"))
	require.Equal(t, "rekordly/evidence/w12/d34/asset", query.Get("public_id"))
	require.Equal(t, "pdf", query.Get("format"))
	require.Equal(t, "authenticated", query.Get("type"))
	require.Equal(t, strconv.FormatInt(expiresAt.Unix(), 10), query.Get("expires_at"))
	require.NotEmpty(t, query.Get("timestamp"))
	require.Equal(t, cloudinarySignature(map[string]string{
		"expires_at": query.Get("expires_at"), "format": "pdf", "public_id": "rekordly/evidence/w12/d34/asset", "timestamp": query.Get("timestamp"), "type": "authenticated",
	}, "secret"), query.Get("signature"))
}

func TestCloudinaryEvidenceVerificationRejectsWrongDeliveryType(t *testing.T) {
	assetID := "rekordly/evidence/w12/d34/asset"
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"public_id":"rekordly/evidence/w12/d34/asset","bytes":1024,"format":"pdf","resource_type":"raw","type":"upload"}`))
	}))
	defer server.Close()
	authorizer := NewCloudinaryEvidenceAuthorizer(CloudinaryEvidenceConfig{CloudName: "demo", APIKey: "key", APISecret: "secret", AdminAPIBaseURL: server.URL})
	_, err := authorizer.Verify(context.Background(), assetID)
	require.ErrorIs(t, err, ErrEvidenceAsset)
}

func TestCloudinaryEvidenceVerificationAcceptsVerifiedPrivatePDF(t *testing.T) {
	assetID := "rekordly/evidence/w12/d34/asset"
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"public_id":"rekordly/evidence/w12/d34/asset","bytes":1024,"format":"pdf","resource_type":"raw","type":"authenticated"}`))
	}))
	defer server.Close()
	authorizer := NewCloudinaryEvidenceAuthorizer(CloudinaryEvidenceConfig{CloudName: "demo", APIKey: "key", APISecret: "secret", AdminAPIBaseURL: server.URL})
	asset, err := authorizer.Verify(context.Background(), assetID)
	require.NoError(t, err)
	require.Equal(t, "application/pdf", asset.MimeType)
	require.Equal(t, int64(1024), asset.Bytes)
}
