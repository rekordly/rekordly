package finance

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Only a single, non-conflicting contact match may be linked automatically.
// Name-only matches are deliberately left for merchant review.
func linkMatchingOrderCustomer(ctx context.Context, tx pgx.Tx, ws, orderID int64, email, phone string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	var digits strings.Builder
	for _, ch := range phone {
		if ch >= '0' && ch <= '9' {
			digits.WriteRune(ch)
		}
	}
	phone = strings.TrimPrefix(digits.String(), "00")
	if email == "" && phone == "" {
		return nil
	}
	rows, err := tx.Query(ctx, `
		SELECT id, lower(btrim(coalesce(email, ''))),
		       regexp_replace(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '^00', '')
		FROM counterparties
		WHERE workspace_id=$1 AND is_active AND party_type IN ('customer', 'both')
		AND (($2 <> '' AND lower(btrim(email))=$2)
		  OR ($3 <> '' AND regexp_replace(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '^00', '')=$3))
		LIMIT 2`, ws, email, phone)
	if err != nil {
		return err
	}
	var targetID int64
	count := 0
	conflict := false
	for rows.Next() {
		var matchedEmail, matchedPhone string
		if err := rows.Scan(&targetID, &matchedEmail, &matchedPhone); err != nil {
			rows.Close()
			return err
		}
		count++
		if (email != "" && matchedEmail != "" && email != matchedEmail) || (phone != "" && matchedPhone != "" && phone != matchedPhone) {
			conflict = true
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if count != 1 || conflict {
		return nil
	}
	_, err = tx.Exec(ctx, `UPDATE storefront_orders SET customer_id=$3, updated_at=now() WHERE workspace_id=$1 AND id=$2 AND customer_id IS NULL`, ws, orderID, targetID)
	return err
}
