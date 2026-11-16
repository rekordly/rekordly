package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type CreatePurchaseOrderShareInput struct {
	SupplierEmail string `json:"supplier_email"`
	ExpiresInDays int    `json:"expires_in_days"`
	ForceNewLink  bool   `json:"force_new_link"`
}

type SupplierShareLineUpdate struct {
	ID       int64  `json:"id"`
	Quantity string `json:"quantity,omitempty"`
	UnitCost string `json:"unit_cost"`
}

type PurchaseOrderShareView struct {
	Token         string            `json:"token,omitempty"`
	URL           string            `json:"url,omitempty"`
	Status        string            `json:"status"`
	WorkspaceName string            `json:"workspace_name,omitempty"`
	SupplierName  string            `json:"supplier_name,omitempty"`
	SupplierEmail *string           `json:"supplier_email,omitempty"`
	ResponseNote  *string           `json:"response_note,omitempty"`
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

func (s *Service) enrichPOShareNames(ctx context.Context, workspaceID int64, supplierID *int64) (wsName, supName string) {
	wsName = "Merchant"
	supName = "Supplier"
	_ = s.pool.QueryRow(ctx, `SELECT name FROM workspaces WHERE id = $1`, workspaceID).Scan(&wsName)
	if supplierID != nil && *supplierID > 0 {
		_ = s.pool.QueryRow(ctx, `SELECT name FROM counterparties WHERE id = $1 AND workspace_id = $2`, *supplierID, workspaceID).Scan(&supName)
	}
	return
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
	if po.Status != "issued" && po.Status != "acknowledged" && po.Status != "partially_received" && po.Status != "fully_received" {
		return PurchaseOrderShareView{}, errors.New("only an issued purchase order can be shared")
	}

	if !in.ForceNewLink {
		if active, err := s.queries.GetActivePurchaseOrderShareByOrderID(ctx, db.GetActivePurchaseOrderShareByOrderIDParams{
			WorkspaceID:     workspaceID,
			PurchaseOrderID: orderID,
		}); err == nil && active.RawToken.Valid && active.RawToken.String != "" {
			detail, err := s.GetPurchaseOrder(ctx, workspaceID, orderID)
			if err != nil {
				return PurchaseOrderShareView{}, err
			}
			wsName, supName := s.enrichPOShareNames(ctx, workspaceID, detail.SupplierID)
			token := active.RawToken.String
			return PurchaseOrderShareView{
				Token:         token,
				URL:           "/purchase-orders/share/" + token,
				Status:        active.Status,
				WorkspaceName: wsName,
				SupplierName:  supName,
				SupplierEmail: nullableText(active.SupplierEmail),
				ExpiresAt:     active.ExpiresAt.Time.UTC().Format(time.RFC3339),
				Order:         detail,
			}, nil
		}
	} else {
		_ = s.queries.RevokeActivePurchaseOrderShares(ctx, db.RevokeActivePurchaseOrderSharesParams{
			WorkspaceID:     workspaceID,
			PurchaseOrderID: orderID,
		})
	}

	token, hash, err := shareToken()
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	var expires = time.Now().UTC().Add(time.Duration(days) * 24 * time.Hour)
	if _, err = s.queries.CreatePurchaseOrderShareWithRaw(ctx, db.CreatePurchaseOrderShareWithRawParams{
		WorkspaceID:     workspaceID,
		PurchaseOrderID: orderID,
		TokenHash:       hash,
		RawToken:        pgtype.Text{String: token, Valid: true},
		SupplierEmail:   optionalPgText(in.SupplierEmail),
		ExpiresAt:       pgtype.Timestamptz{Time: expires, Valid: true},
		CreatedByUserID: userID,
	}); err != nil {
		return PurchaseOrderShareView{}, err
	}
	detail, err := s.GetPurchaseOrder(ctx, workspaceID, orderID)
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	wsName, supName := s.enrichPOShareNames(ctx, workspaceID, detail.SupplierID)
	var email *string
	if strings.TrimSpace(in.SupplierEmail) != "" {
		v := strings.TrimSpace(in.SupplierEmail)
		email = &v
	}
	return PurchaseOrderShareView{
		Token:         token,
		URL:           "/purchase-orders/share/" + token,
		Status:        "active",
		WorkspaceName: wsName,
		SupplierName:  supName,
		SupplierEmail: email,
		ExpiresAt:     expires.Format(time.RFC3339),
		Order:         detail,
	}, nil
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
	var email, respNote *string
	var expires time.Time
	err := s.pool.QueryRow(ctx, "SELECT workspace_id,purchase_order_id,status,supplier_email,response_note,expires_at FROM purchase_order_shares WHERE token_hash=$1", hash).Scan(&workspaceID, &orderID, &status, &email, &respNote, &expires)
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
	wsName, supName := s.enrichPOShareNames(ctx, workspaceID, detail.SupplierID)
	return PurchaseOrderShareView{
		Token:         token,
		URL:           "/purchase-orders/share/" + token,
		Status:        status,
		WorkspaceName: wsName,
		SupplierName:  supName,
		SupplierEmail: email,
		ResponseNote:  respNote,
		ExpiresAt:     expires.UTC().Format(time.RFC3339),
		Order:         detail,
	}, nil
}

func (s *Service) RespondPurchaseOrderShare(ctx context.Context, token, response, note string) (PurchaseOrderShareView, error) {
	return s.RespondPurchaseOrderShareWithLines(ctx, token, response, note, nil)
}

func (s *Service) RespondPurchaseOrderShareWithLines(
	ctx context.Context,
	token, response, note string,
	lineUpdates []SupplierShareLineUpdate,
) (PurchaseOrderShareView, error) {
	token = strings.TrimSpace(token)
	response = strings.ToLower(strings.TrimSpace(response))
	note = strings.TrimSpace(note)
	if response != "acknowledged" && response != "declined" && response != "change_requested" {
		return PurchaseOrderShareView{}, errors.New("response must be acknowledged, declined or change_requested")
	}
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])

	var shareID, workspaceID, orderID int64
	var status string
	var email *string
	var expires time.Time
	err := s.pool.QueryRow(
		ctx,
		`UPDATE purchase_order_shares
		 SET status=$2, response_note=$3, responded_at=now()
		 WHERE token_hash=$1 AND status IN ('active', 'change_requested', 'acknowledged') AND expires_at>now()
		 RETURNING id, workspace_id, purchase_order_id, status, supplier_email, expires_at`,
		hash, response, optionalText(note),
	).Scan(&shareID, &workspaceID, &orderID, &status, &email, &expires)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PurchaseOrderShareView{}, ErrNotFound
		}
		return PurchaseOrderShareView{}, err
	}

	po, err := s.queries.GetPurchaseOrderByID(ctx, db.GetPurchaseOrderByIDParams{WorkspaceID: workspaceID, ID: orderID})
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	exponent := int(po.CurrencyExponent)
	if exponent <= 0 {
		exponent = CurrencyExponent(po.Currency)
	}

	// Apply any supplier line price / quantity updates
	priceChanged := false
	if len(lineUpdates) > 0 {
		existingLines, lErr := s.queries.GetPurchaseOrderLines(ctx, db.GetPurchaseOrderLinesParams{
			WorkspaceID:     workspaceID,
			PurchaseOrderID: orderID,
		})
		if lErr == nil && len(existingLines) > 0 {
			updatesByID := map[int64]SupplierShareLineUpdate{}
			for _, u := range lineUpdates {
				if u.ID > 0 {
					updatesByID[u.ID] = u
				}
			}
			var newGrandTotal int64
			for _, line := range existingLines {
				qty := line.Quantity
				unitCost := line.ExpectedUnitCostMinor
				if upd, ok := updatesByID[line.ID]; ok {
					if strings.TrimSpace(upd.Quantity) != "" {
						if parsedQty, _, qErr := parseRequestQuantity(upd.Quantity); qErr == nil && parsedQty.IsPositive() {
							if !parsedQty.Equal(qty) {
								qty = parsedQty
								priceChanged = true
							}
						}
					}
					if strings.TrimSpace(upd.UnitCost) != "" {
						if parsedCost, cErr := ParseMajorToMinor(upd.UnitCost, exponent); cErr == nil && parsedCost > 0 {
							if parsedCost != unitCost {
								unitCost = parsedCost
								priceChanged = true
							}
						}
					}
				}
				gross, gErr := requestLineTotal(unitCost, qty)
				if gErr != nil {
					gross = line.LineTotalMinor
				}
				lineTotal := gross - line.DiscountMinor + line.TaxAmountMinor
				if lineTotal <= 0 {
					lineTotal = gross
				}
				newGrandTotal += lineTotal
				_, _ = s.pool.Exec(
					ctx,
					`UPDATE purchase_order_lines
					 SET quantity=$4, expected_unit_cost_minor=$5, line_total_minor=$6
					 WHERE workspace_id=$1 AND purchase_order_id=$2 AND id=$3`,
					workspaceID, orderID, line.ID, qty, unitCost, lineTotal,
				)
			}
			if newGrandTotal > 0 {
				_, _ = s.pool.Exec(
					ctx,
					`UPDATE purchase_orders SET total_minor=$3, updated_at=now() WHERE workspace_id=$1 AND id=$2`,
					workspaceID, orderID, newGrandTotal,
				)
			}
		}
	}

	// Update PO status / acknowledgement note
	if response == "acknowledged" && po.Status == "issued" {
		_, _ = s.pool.Exec(
			ctx,
			`UPDATE purchase_orders
			 SET status='acknowledged', acknowledged_at=now(), acknowledgement_note=$3, updated_at=now()
			 WHERE workspace_id=$1 AND id=$2`,
			workspaceID, orderID, optionalText(note),
		)
	} else if note != "" {
		_, _ = s.pool.Exec(
			ctx,
			`UPDATE purchase_orders
			 SET acknowledgement_note=$3, updated_at=now()
			 WHERE workspace_id=$1 AND id=$2`,
			workspaceID, orderID, optionalText(note),
		)
	}

	actorID := po.CreatedByUserID
	_, _ = s.queries.CreatePurchaseOrderEvent(ctx, db.CreatePurchaseOrderEventParams{
		WorkspaceID:     workspaceID,
		PurchaseOrderID: orderID,
		EventType:       response,
		OrderVersion:    po.Version,
		Note:            optionalPgText(note),
		ActorUserID:     actorID,
	})

	detail, err := s.GetPurchaseOrder(ctx, workspaceID, orderID)
	if err != nil {
		return PurchaseOrderShareView{}, err
	}
	wsName, supName := s.enrichPOShareNames(ctx, workspaceID, detail.SupplierID)
	poLabel := fmt.Sprintf("PO #%d", orderID)
	if detail.OrderNumber != nil && strings.TrimSpace(*detail.OrderNumber) != "" {
		poLabel = *detail.OrderNumber
	}

	// Build human-readable summary for external messages & in-app notifications
	var notifTitle, notifBody string
	switch response {
	case "acknowledged":
		if priceChanged {
			notifTitle = fmt.Sprintf("%s acknowledged with updated prices", poLabel)
			notifBody = fmt.Sprintf("%s updated unit prices and acknowledged %s.", supName, poLabel)
		} else {
			notifTitle = fmt.Sprintf("%s acknowledged by %s", poLabel, supName)
			notifBody = fmt.Sprintf("%s acknowledged %s.", supName, poLabel)
		}
	case "change_requested":
		if priceChanged {
			notifTitle = fmt.Sprintf("Price update submitted on %s", poLabel)
			notifBody = fmt.Sprintf("%s updated item prices on %s.", supName, poLabel)
		} else {
			notifTitle = fmt.Sprintf("Changes requested on %s", poLabel)
			notifBody = fmt.Sprintf("%s requested changes on %s.", supName, poLabel)
		}
	case "declined":
		notifTitle = fmt.Sprintf("%s declined by %s", poLabel, supName)
		notifBody = fmt.Sprintf("%s declined %s.", supName, poLabel)
	}
	if note != "" {
		notifBody += " Note: " + note
	}

	// Record in guest messages thread so buyer sees it on the PO messages list
	_, _ = s.queries.CreateExternalMessage(ctx, db.CreateExternalMessageParams{
		WorkspaceID:  workspaceID,
		DocumentType: "purchase_order",
		DocumentID:   orderID,
		ShareID:      pgtype.Int8{Int64: shareID, Valid: true},
		SenderType:   "guest",
		SenderName:   supName,
		Message:      notifBody,
	})

	// Send live in-app notification to buyer workspace members
	s.notifyWorkspaceUsers(ctx, workspaceID, "inventory", "purchase_order", orderID, notifTitle, notifBody, fmt.Sprintf("/purchase-orders/%d", orderID))

	var respNotePtr *string
	if note != "" {
		respNotePtr = &note
	}
	return PurchaseOrderShareView{
		Token:         token,
		URL:           "/purchase-orders/share/" + token,
		Status:        status,
		WorkspaceName: wsName,
		SupplierName:  supName,
		SupplierEmail: email,
		ResponseNote:  respNotePtr,
		ExpiresAt:     expires.UTC().Format(time.RFC3339),
		Order:         detail,
	}, nil
}
