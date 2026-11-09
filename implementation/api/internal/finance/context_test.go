package finance

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/auth"
)

const (
	validSession = "session-token"
	validCSRF    = "csrf-token"
)

type fakeValidator struct {
	csrfChecks int
}

func (validator *fakeValidator) CurrentUser(_ context.Context, rawSession string) (auth.CurrentUser, error) {
	if rawSession != validSession {
		return auth.CurrentUser{}, errors.New("invalid session")
	}
	return auth.CurrentUser{ID: 7, Workspaces: []auth.AuthorizedWorkspace{{ID: 1, IsOwner: true, Kind: "business"}}}, nil
}

func (validator *fakeValidator) VerifySessionCSRF(_ context.Context, _ string, csrfToken string) error {
	validator.csrfChecks++
	if csrfToken != validCSRF {
		return errors.New("invalid csrf")
	}
	return nil
}

func serveMiddleware(validator AuthSessionValidator, request *http.Request) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(AuthAndWorkspaceMiddleware(nil, validator))
	router.Any("/resource", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestFinanceCSRFEnforcement(t *testing.T) {
	cases := []struct {
		name       string
		method     string
		bearer     bool
		csrfHeader string
		wantStatus int
		wantChecks int
	}{
		{name: "cookie read needs no token", method: http.MethodGet, wantStatus: http.StatusNoContent},
		{name: "cookie write without token is rejected", method: http.MethodPost, wantStatus: http.StatusForbidden, wantChecks: 1},
		{name: "cookie write with wrong token is rejected", method: http.MethodPost, csrfHeader: "forged", wantStatus: http.StatusForbidden, wantChecks: 1},
		{name: "cookie write with correct token passes", method: http.MethodPost, csrfHeader: validCSRF, wantStatus: http.StatusNoContent, wantChecks: 1},
		{name: "cookie delete is also protected", method: http.MethodDelete, wantStatus: http.StatusForbidden, wantChecks: 1},
		{name: "bearer write is not subject to CSRF", method: http.MethodPost, bearer: true, wantStatus: http.StatusNoContent},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(testCase.method, "/resource", nil)
			if testCase.bearer {
				request.Header.Set("Authorization", "Bearer "+validSession)
			} else {
				request.AddCookie(&http.Cookie{Name: "rekordly_session", Value: validSession})
			}
			if testCase.csrfHeader != "" {
				request.Header.Set("X-CSRF-Token", testCase.csrfHeader)
			}

			validator := &fakeValidator{}
			recorder := serveMiddleware(validator, request)
			if recorder.Code != testCase.wantStatus {
				t.Fatalf("status = %d, want %d", recorder.Code, testCase.wantStatus)
			}
			if validator.csrfChecks != testCase.wantChecks {
				t.Fatalf("csrf checks = %d, want %d", validator.csrfChecks, testCase.wantChecks)
			}
		})
	}
}
