package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/rekordly/rekordly-api/internal/db"
	"strings"
	"time"
)

type CreatePurchaseOrderShareInput struct {
	SupplierEmail string `json:"supplier_email"`
	ExpiresInDays int    `json:"expires_in_days"`
}
type PurchaseOrderShareView struct {
	Token         string            `json:"token,omitempty"`
	Status        string            `json:"status"`
	SupplierEmail *string           `json:"supplier_email,omitempty"`
	ExpiresAt     string            `json:"expires_at"`
	Order         PurchaseOrderView `json:"order"`
}

func shareToken() (string, string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	token := hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))
	return token, hex.EncodeToString(sum[:]), nil
}

func (s *Service) CreatePurchaseOrderShare(ctx context.Context, workspaceID, userID, orderID int64, in CreatePurchaseOrderShareInput) (PurchaseOrderShareView, error) {
	if orderID <= 0 {
		return PurchaseOrderShareView{}, errors.New("purchase order is required")
	}
	days := in.ExpiresInDays
	if days <= 0 || days > 30 {
		days = 7
	}
	po, err := s.queries.GetPurchaseOrderByID(ctx, db.GetPurchaseOrderByIDParams{WorkspaceID: workspaceID, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseOrderShareView{}, ErrNotFound
	}
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	if po.Status != "issued" && po.Status != "acknowledged" && po.Status != "partially_received" {
		return PurchaseOrderShareView{}, errors.New("only an issued purchase order can be shared")
	}
	token, hash, err := shareToken()
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	var id int64
	var expires = time.Now().UTC().Add(time.Duration(days) * 24 * time.Hour)
	if err = s.pool.QueryRow(ctx, "INSERT INTO purchase_order_shares(workspace_id,purchase_order_id,token_hash,supplier_email,expires_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", workspaceID, orderID, hash, optionalText(in.SupplierEmail), expires, userID).Scan(&id); err != nil {
		return PurchaseOrderShareView{}, err
	}
	_ = id
	detail, err := s.GetPurchaseOrder(ctx, workspaceID, orderID)
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	var email *string
	if strings.TrimSpace(in.SupplierEmail) != "" {
		v := strings.TrimSpace(in.SupplierEmail)
		email = &v
	}
	return PurchaseOrderShareView{Token: token, Status: "active", SupplierEmail: email, ExpiresAt: expires.Format(time.RFC3339), Order: detail}, nil
}

func (s *Service) GetPurchaseOrderShare(ctx context.Context, token string) (PurchaseOrderShareView, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return PurchaseOrderShareView{}, ErrNotFound
	}
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	var workspaceID, orderID int64
	var status string
	var email *string
	var expires time.Time
	err := s.pool.QueryRow(ctx, "SELECT workspace_id,purchase_order_id,status,supplier_email,expires_at FROM purchase_order_shares WHERE token_hash=$1", hash).Scan(&workspaceID, &orderID, &status, &email, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseOrderShareView{}, ErrNotFound
	}
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	if time.Now().UTC().After(expires) {
		return PurchaseOrderShareView{}, errors.New("purchase order share has expired")
	}
	detail, err := s.GetPurchaseOrder(ctx, workspaceID, orderID)
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	return PurchaseOrderShareView{Status: status, SupplierEmail: email, ExpiresAt: expires.UTC().Format(time.RFC3339), Order: detail}, nil
}

func (s *Service) RespondPurchaseOrderShare(ctx context.Context, token, response, note string) (PurchaseOrderShareView, error) {
	token = strings.TrimSpace(token)
	response = strings.ToLower(strings.TrimSpace(response))
	if response != "acknowledged" && response != "declined" && response != "change_requested" {
		return PurchaseOrderShareView{}, errors.New("response must be acknowledged, declined or change_requested")
	}
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	var workspaceID, orderID int64
	var status string
	var email *string
	var expires time.Time
	if err := s.pool.QueryRow(ctx, "UPDATE purchase_order_shares SET status=$2,response_note=$3,responded_at=now() WHERE token_hash=$1 AND status='active' AND expires_at>now() RETURNING workspace_id,purchase_order_id,status,supplier_email,expires_at", hash, response, optionalText(note)).Scan(&workspaceID, &orderID, &status, &email, &expires); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PurchaseOrderShareView{}, ErrNotFound
		}
		return PurchaseOrderShareView{}, err
	}
	detail, err := s.GetPurchaseOrder(ctx, workspaceID, orderID)
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	return PurchaseOrderShareView{Status: status, SupplierEmail: email, ExpiresAt: expires.UTC().Format(time.RFC3339), Order: detail}, nil
}
