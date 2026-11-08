package finance

import (
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func (handler *Handler) RegisterRoutes(group *gin.RouterGroup) {
	group.POST("/workspaces/:workspace_id/money-record-drafts", handler.createDraft)
}

func (handler *Handler) createDraft(c *gin.Context) {
	workspaceID, err := strconv.ParseInt(c.Param("workspace_id"), 10, 64)
	if err != nil || workspaceID <= 0 { c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Workspace is invalid."}}); return }
	var input DraftInput
	if err := c.ShouldBindJSON(&input); err != nil { c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": "Please check the finance details and try again."}}); return }
	session, err := c.Cookie("rekordly_session")
	if err != nil || strings.TrimSpace(session) == "" { c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "INVALID_PROOF", "message": "Your session is invalid or expired."}}); return }
	csrfCookie, csrfErr := c.Cookie("rekordly_csrf")
	csrfHeader := c.GetHeader("X-CSRF-Token")
	if csrfErr != nil || csrfCookie == "" || csrfHeader == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "INVALID_PROOF", "message": "This request could not be verified."}})
		return
	}
	cookieDigest := sha256.Sum256([]byte(csrfCookie))
	headerDigest := sha256.Sum256([]byte(csrfHeader))
	if subtle.ConstantTimeCompare(cookieDigest[:], headerDigest[:]) != 1 {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "INVALID_PROOF", "message": "This request could not be verified."}})
		return
	}
	var userID int64
	digest := sha256.Sum256([]byte(session))
	err = handler.service.pool.QueryRow(c.Request.Context(), `SELECT user_id FROM sessions WHERE refresh_digest=$1 AND session_kind='full' AND revoked_at IS NULL AND expires_at > now()`, digest[:]).Scan(&userID)
	if err != nil { c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "INVALID_PROOF", "message": "Your session is invalid or expired."}}); return }
	result, err := handler.service.CreateDraft(c.Request.Context(), userID, workspaceID, c.GetHeader("Idempotency-Key"), input)
	if errors.Is(err, ErrIdempotencyConflict) { c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "IDEMPOTENCY_CONFLICT", "message": "This request key was already used for different finance details."}}); return }
	if err != nil { c.JSON(http.StatusUnprocessableEntity, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": "Please check the finance details and try again."}}); return }
	c.JSON(http.StatusCreated, gin.H{"data": result})
}
