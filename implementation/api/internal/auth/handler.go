package auth

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/db"
)

const maxAuthBodyBytes = 4 << 10

type Handler struct {
	service      *Service
	google       *GoogleOIDC
	secureCookie bool
}

func NewHandler(service *Service, google *GoogleOIDC, production bool) *Handler {
	return &Handler{service: service, google: google, secureCookie: production}
}

func (handler *Handler) RegisterRoutes(group *gin.RouterGroup) {
	auth := group.Group("/auth")
	auth.POST("/email/continue", handler.emailContinuation)
	auth.POST("/password/sign-in", handler.signIn)
	auth.POST("/password/create", handler.createPassword)
	auth.POST("/password/reset/request", handler.requestReset)
	auth.POST("/password/reset/complete", handler.completeReset)
	auth.POST("/otp/request", handler.requestOTP)
	auth.POST("/otp/verify", handler.verifyOTP)
	auth.POST("/magic/request", handler.requestMagicLink)
	auth.GET("/magic/inspect", handler.inspectMagicLink)
	auth.POST("/magic/confirm", handler.confirmMagicLink)
	auth.GET("/google/start", handler.startGoogle)
	auth.GET("/google/callback", handler.googleCallback)
	auth.POST("/google/link/password", handler.linkGoogleWithPassword)
	auth.POST("/google/disconnect", handler.disconnectGoogle)
	auth.POST("/refresh", handler.refreshSession)
	auth.POST("/logout", handler.logout)
	auth.POST("/logout-all", handler.logoutAll)
	group.GET("/me/sessions", handler.listSessions)
	group.DELETE("/me/sessions/:id", handler.revokeSession)
	group.GET("/me", handler.currentUser)
	group.PUT("/me/onboarding/preferences", handler.saveOnboardingPreferences)
	group.POST("/me/onboarding/workspaces", handler.createInitialWorkspaces)
	group.GET("/invitations/:token", handler.inspectInvitation)
	group.POST("/invitations/:token/otp/request", handler.requestInvitationOTP)
	group.POST("/invitations/:token/otp/verify", handler.verifyInvitationOTP)
	group.POST("/invitations/:token/accept", handler.acceptInvitation)
}

type emailRequest struct {
	Email string `json:"email" binding:"required"`
}

type passwordSignInRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type passwordRequest struct {
	Password string `json:"password" binding:"required"`
}

type passwordResetRequest struct {
	Token    string `json:"token" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type otpRequest struct {
	Email   string `json:"email" binding:"required"`
	Purpose string `json:"purpose" binding:"required"`
}

type otpVerifyRequest struct {
	Email   string `json:"email" binding:"required"`
	Purpose string `json:"purpose" binding:"required"`
	Code    string `json:"code" binding:"required"`
}

type magicRequest struct {
	Email    string `json:"email" binding:"required"`
	ReturnTo string `json:"return_to"`
}

type magicConfirmRequest struct {
	Token string `json:"token" binding:"required"`
}

type googleLinkPasswordRequest struct {
	LinkProofToken string `json:"link_proof_token" binding:"required"`
	Password       string `json:"password" binding:"required"`
}

type invitationOTPVerifyRequest struct {
	Code string `json:"code" binding:"required"`
}

type onboardingPreferencesRequest struct {
	FlowVersion   int32          `json:"flow_version" binding:"required"`
	SelectedRoles []string       `json:"selected_roles" binding:"required"`
	SpaceChoice   string         `json:"space_choice" binding:"required"`
	Preferences   map[string]any `json:"preferences"`
}

func (handler *Handler) emailContinuation(c *gin.Context) {
	var request emailRequest
	if !bindJSON(c, &request) {
		return
	}
	continuation, err := handler.service.EmailContinuation(c.Request.Context(), request.Email, c.ClientIP())
	if err != nil {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"continuation": continuation}})
}

func (handler *Handler) signIn(c *gin.Context) {
	var request passwordSignInRequest
	if !bindJSON(c, &request) {
		return
	}
	proof, err := handler.service.SignIn(c.Request.Context(), request.Email, request.Password, c.ClientIP(), deviceLabel(c), userAgent(c), "")
	if err != nil {
		handler.writeError(c, err)
		return
	}
	handler.writeSession(c, proof)
}

func (handler *Handler) createPassword(c *gin.Context) {
	var request passwordRequest
	if !bindJSON(c, &request) {
		return
	}
	preAuthToken := strings.TrimSpace(c.GetHeader("X-Preauth-Token"))
	if preAuthToken == "" {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	proof, err := handler.service.CreatePassword(c.Request.Context(), preAuthToken, request.Password, deviceLabel(c), userAgent(c), "")
	if err != nil {
		handler.writeError(c, err)
		return
	}
	handler.writeSession(c, proof)
}

func (handler *Handler) requestReset(c *gin.Context) {
	var request emailRequest
	if !bindJSON(c, &request) {
		return
	}
	if err := handler.service.RequestPasswordReset(c.Request.Context(), request.Email, c.ClientIP()); err != nil {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"data": gin.H{"message": "If the account is eligible, password reset instructions will be sent."}})
}

func (handler *Handler) completeReset(c *gin.Context) {
	var request passwordResetRequest
	if !bindJSON(c, &request) {
		return
	}
	proof, err := handler.service.CompletePasswordReset(c.Request.Context(), request.Token, request.Password, deviceLabel(c), userAgent(c), "")
	if err != nil {
		handler.writeError(c, err)
		return
	}
	handler.writeSession(c, proof)
}

func (handler *Handler) requestOTP(c *gin.Context) {
	var request otpRequest
	if !bindJSON(c, &request) {
		return
	}
	if err := handler.service.RequestOTP(c.Request.Context(), request.Email, request.Purpose, c.ClientIP()); err != nil && !errors.Is(err, ErrRateLimited) {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"data": gin.H{"message": "If the request is eligible, a verification code will be sent."}})
}

func (handler *Handler) verifyOTP(c *gin.Context) {
	var request otpVerifyRequest
	if !bindJSON(c, &request) {
		return
	}
	proof, err := handler.service.VerifyOTP(c.Request.Context(), request.Email, request.Purpose, request.Code, deviceLabel(c), userAgent(c), "")
	if err != nil {
		handler.writeError(c, err)
		return
	}
	handler.writeSession(c, proof)
}

func (handler *Handler) requestMagicLink(c *gin.Context) {
	var request magicRequest
	if !bindJSON(c, &request) {
		return
	}
	if err := handler.service.RequestMagicLink(c.Request.Context(), request.Email, safeReturnTo(request.ReturnTo), c.ClientIP()); err != nil && !errors.Is(err, ErrRateLimited) {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"data": gin.H{"message": "If the account is eligible, a sign-in link will be sent."}})
}

func (handler *Handler) inspectMagicLink(c *gin.Context) {
	if err := handler.service.InspectMagicLink(c.Request.Context(), c.Query("token")); err != nil {
		handler.writeError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Header("Referrer-Policy", "no-referrer")
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"valid": true, "confirmation_required": true}})
}

func (handler *Handler) confirmMagicLink(c *gin.Context) {
	var request magicConfirmRequest
	if !bindJSON(c, &request) {
		return
	}
	proof, err := handler.service.ConfirmMagicLink(c.Request.Context(), request.Token, deviceLabel(c), userAgent(c), "")
	if err != nil {
		handler.writeError(c, err)
		return
	}
	handler.writeSession(c, proof)
}

func (handler *Handler) startGoogle(c *gin.Context) {
	if handler.google == nil {
		handler.writeError(c, ErrGoogleUnavailable)
		return
	}
	authorizationURL, flowCookie, err := handler.google.Start(c.Request.Context(), db.New(handler.service.pool), safeReturnTo(c.Query("return_to")))
	if err != nil {
		handler.writeError(c, err)
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("rekordly_google_flow", flowCookie, 600, "/api/v1/auth/google", "", handler.secureCookie, true)
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"authorization_url": authorizationURL}})
}

func (handler *Handler) googleCallback(c *gin.Context) {
	if handler.google == nil || c.Query("error") != "" {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	flowCookie, err := c.Cookie("rekordly_google_flow")
	if err != nil {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	claims, returnTo, err := handler.google.Callback(c.Request.Context(), db.New(handler.service.pool), c.Query("code"), c.Query("state"), flowCookie)
	if err != nil {
		handler.writeError(c, err)
		return
	}
	result, err := handler.service.CompleteGoogleIdentity(c.Request.Context(), claims, deviceLabel(c), userAgent(c), "")
	if err != nil {
		handler.writeError(c, err)
		return
	}
	c.SetCookie("rekordly_google_flow", "", -1, "/api/v1/auth/google", "", handler.secureCookie, true)
	c.Header("Cache-Control", "no-store")
	if result.RequiresLinkProof {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"requires_existing_account_proof": true, "link_proof_token": result.LinkProofToken, "return_to": returnTo}})
		return
	}
	handler.writeSession(c, result.Session)
}

func (handler *Handler) linkGoogleWithPassword(c *gin.Context) {
	var request googleLinkPasswordRequest
	if !bindJSON(c, &request) {
		return
	}
	proof, err := handler.service.CompleteGoogleLinkWithPassword(c.Request.Context(), request.LinkProofToken, request.Password, deviceLabel(c), userAgent(c), "")
	if err != nil {
		handler.writeError(c, err)
		return
	}
	handler.writeSession(c, proof)
}

func (handler *Handler) disconnectGoogle(c *gin.Context) {
	sessionToken, err := c.Cookie("rekordly_session")
	if err != nil {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	csrfCookie, err := c.Cookie("rekordly_csrf")
	if err != nil || !subtleCompare(csrfCookie, c.GetHeader("X-CSRF-Token")) {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	if err := handler.service.DisconnectGoogle(c.Request.Context(), sessionToken, csrfCookie); err != nil {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"disconnected": true}})
}

func (handler *Handler) sessionAndCSRF(c *gin.Context) (string, string, bool) {
	sessionToken, err := c.Cookie("rekordly_session")
	if err != nil {
		handler.writeError(c, ErrInvalidProof)
		return "", "", false
	}
	csrfCookie, err := c.Cookie("rekordly_csrf")
	if err != nil || !subtleCompare(csrfCookie, c.GetHeader("X-CSRF-Token")) {
		handler.writeError(c, ErrInvalidProof)
		return "", "", false
	}
	return sessionToken, csrfCookie, true
}

func (handler *Handler) refreshSession(c *gin.Context) {
	sessionToken, csrfToken, ok := handler.sessionAndCSRF(c)
	if !ok {
		return
	}
	proof, err := handler.service.RefreshSession(c.Request.Context(), sessionToken, csrfToken, deviceLabel(c), userAgent(c), "")
	if err != nil {
		handler.writeError(c, err)
		return
	}
	handler.writeSession(c, proof)
}

func (handler *Handler) logout(c *gin.Context) {
	sessionToken, csrfToken, ok := handler.sessionAndCSRF(c)
	if !ok {
		return
	}
	if err := handler.service.Logout(c.Request.Context(), sessionToken, csrfToken); err != nil {
		handler.writeError(c, err)
		return
	}
	handler.clearSessionCookies(c)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"logged_out": true}})
}

func (handler *Handler) logoutAll(c *gin.Context) {
	sessionToken, csrfToken, ok := handler.sessionAndCSRF(c)
	if !ok {
		return
	}
	if err := handler.service.LogoutAll(c.Request.Context(), sessionToken, csrfToken); err != nil {
		handler.writeError(c, err)
		return
	}
	handler.clearSessionCookies(c)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"logged_out": true}})
}

func (handler *Handler) listSessions(c *gin.Context) {
	sessionToken, err := c.Cookie("rekordly_session")
	if err != nil {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	sessions, err := handler.service.ListSessions(c.Request.Context(), sessionToken)
	if err != nil {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"sessions": sessions}})
}

func (handler *Handler) revokeSession(c *gin.Context) {
	sessionToken, csrfToken, ok := handler.sessionAndCSRF(c)
	if !ok {
		return
	}
	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || sessionID < 1 {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	if err := handler.service.RevokeSelectedSession(c.Request.Context(), sessionToken, csrfToken, sessionID); err != nil {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"revoked": true}})
}

func (handler *Handler) currentUser(c *gin.Context) {
	sessionToken, err := c.Cookie("rekordly_session")
	if err != nil {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	current, err := handler.service.CurrentUser(c.Request.Context(), sessionToken)
	if err != nil {
		handler.writeError(c, err)
		return
	}
	// The cookie is scoped to the API host, so the web app on another host cannot
	// read it. CORS limits this response to approved origins, which keeps the
	// token away from anything else on the domain, such as storefront subdomains.
	current.CSRFToken, _ = c.Cookie("rekordly_csrf")
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"data": current})
}

func (handler *Handler) saveOnboardingPreferences(c *gin.Context) {
	sessionToken, csrfToken, ok := handler.sessionAndCSRF(c)
	if !ok {
		return
	}
	var request onboardingPreferencesRequest
	if !bindJSON(c, &request) {
		return
	}
	state, err := handler.service.SaveOnboardingPreferences(c.Request.Context(), sessionToken, csrfToken, OnboardingPreferencesInput{
		FlowVersion: request.FlowVersion, SelectedRoles: request.SelectedRoles, SpaceChoice: request.SpaceChoice, Preferences: request.Preferences,
	})
	if err != nil {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": state})
}

func (handler *Handler) createInitialWorkspaces(c *gin.Context) {
	sessionToken, csrfToken, ok := handler.sessionAndCSRF(c)
	if !ok {
		return
	}
	var request CreateWorkspacesInput
	if !bindJSON(c, &request) {
		return
	}
	result, err := handler.service.CreateInitialWorkspaces(c.Request.Context(), sessionToken, csrfToken, c.GetHeader("Idempotency-Key"), request)
	if err != nil {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

func (handler *Handler) clearSessionCookies(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("rekordly_session", "", -1, "/", "", handler.secureCookie, true)
	c.SetCookie("rekordly_csrf", "", -1, "/", "", handler.secureCookie, false)
}

func (handler *Handler) inspectInvitation(c *gin.Context) {
	summary, err := handler.service.InspectInvitation(c.Request.Context(), c.Param("token"))
	if err != nil {
		handler.writeError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"workspace_name": summary.WorkspaceName, "role_name": summary.RoleName, "destination": summary.Destination, "expires_at": summary.ExpiresAt}})
}

func (handler *Handler) requestInvitationOTP(c *gin.Context) {
	if err := handler.service.RequestInvitationOTP(c.Request.Context(), c.Param("token"), c.ClientIP()); err != nil && !errors.Is(err, ErrRateLimited) {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"data": gin.H{"message": "If the invitation is eligible, a verification code will be sent."}})
}

func (handler *Handler) verifyInvitationOTP(c *gin.Context) {
	var request invitationOTPVerifyRequest
	if !bindJSON(c, &request) {
		return
	}
	proof, err := handler.service.VerifyInvitationOTP(c.Request.Context(), c.Param("token"), request.Code, deviceLabel(c), userAgent(c))
	if err != nil {
		handler.writeError(c, err)
		return
	}
	handler.writeSession(c, proof)
}

func (handler *Handler) acceptInvitation(c *gin.Context) {
	sessionToken, err := c.Cookie("rekordly_session")
	if err != nil {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	csrfCookie, err := c.Cookie("rekordly_csrf")
	if err != nil || !subtleCompare(csrfCookie, c.GetHeader("X-CSRF-Token")) {
		handler.writeError(c, ErrInvalidProof)
		return
	}
	if err := handler.service.AcceptInvitation(c.Request.Context(), sessionToken, csrfCookie, c.Param("token")); err != nil {
		handler.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"accepted": true}})
}

func (handler *Handler) writeSession(c *gin.Context, proof SessionProof) {
	if proof.Kind == "pre_auth" {
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"user_id": proof.UserID, "onboarding_status": proof.Onboarding, "expires_at": proof.ExpiresAt, "requires_password": true, "pre_auth_token": proof.Token}})
		return
	}
	maxAge := int(time.Until(proof.ExpiresAt).Seconds())
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("rekordly_session", proof.Token, maxAge, "/", "", handler.secureCookie, true)
	c.SetCookie("rekordly_csrf", proof.CSRFToken, maxAge, "/", "", handler.secureCookie, false)
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"user_id": proof.UserID, "onboarding_status": proof.Onboarding, "expires_at": proof.ExpiresAt, "csrf_token": proof.CSRFToken}})
}

func safeReturnTo(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") || strings.Contains(value, "\\") {
		return "/"
	}
	return value
}

func (handler *Handler) writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidCredentials):
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "INVALID_CREDENTIALS", "message": "Email or password is incorrect."}})
	case errors.Is(err, ErrInvalidProof):
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "INVALID_PROOF", "message": "The verification proof is invalid or expired."}})
	case errors.Is(err, ErrRateLimited):
		c.Header("Retry-After", "900")
		c.JSON(http.StatusTooManyRequests, gin.H{"error": gin.H{"code": "RATE_LIMITED", "message": "Too many attempts. Please try again later."}})
	case errors.Is(err, ErrPasswordExists):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "PASSWORD_ALREADY_SET", "message": "A password is already configured for this account."}})
	case errors.Is(err, ErrGoogleUnavailable):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "GOOGLE_UNAVAILABLE", "message": "Google sign-in is not available right now."}})
	case errors.Is(err, ErrSeatLimitReached):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "SEAT_LIMIT_REACHED", "message": "This workspace has no available seat for the invitation."}})
	case errors.Is(err, ErrFinalLoginMethod):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "FINAL_LOGIN_METHOD", "message": "Add another login or recovery method before disconnecting Google."}})
	case errors.Is(err, ErrRefreshInProgress):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "SESSION_ALREADY_ROTATED", "message": "The session was refreshed in another request. Retry with the current cookie."}})
	case errors.Is(err, ErrSessionReplayed):
		handler.clearSessionCookies(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "SESSION_REPLAYED", "message": "The session is no longer valid. Sign in again."}})
	case errors.Is(err, ErrIdempotencyConflict):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "IDEMPOTENCY_CONFLICT", "message": "The idempotency key was already used for a different request."}})
	case errors.Is(err, ErrOnboardingConflict):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "ONBOARDING_CONFLICT", "message": "The onboarding operation is already in progress or conflicts with completed setup."}})
	default:
		if strings.Contains(err.Error(), "password must contain") || strings.Contains(err.Error(), "invalid email") {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Unable to complete the request."}})
	}
}

func bindJSON(c *gin.Context, destination any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAuthBodyBytes)
	if err := c.ShouldBindJSON(destination); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "The request body is invalid."}})
		return false
	}
	return true
}

func userAgent(c *gin.Context) string {
	value := c.Request.UserAgent()
	if len(value) > 160 {
		return value[:160]
	}
	return value
}

func deviceLabel(c *gin.Context) string {
	value := strings.TrimSpace(c.GetHeader("X-Device-Label"))
	if len(value) > 80 {
		return value[:80]
	}
	return value
}
