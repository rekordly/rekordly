package finance

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/crypto"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/notify"
)

const shopperSessionCookieName = "rekordly_shopper_session"

var (
	ErrShopperCodeInvalid     = errors.New("invalid, expired, or locked verification code")
	ErrShopperUnauthenticated = errors.New("shopper session required")
	ErrShopperRateLimited     = errors.New("too many verification requests; try again shortly")
)

type ShopperProfileView struct {
	Email          string   `json:"email"`
	Name           *string  `json:"name,omitempty"`
	Phone          *string  `json:"phone,omitempty"`
	SavedAddresses []string `json:"saved_addresses"`
}

type ShopperOrderSummaryView struct {
	OrderReference   string `json:"order_reference"`
	StorefrontName   string `json:"storefront_name"`
	StorefrontSlug   string `json:"storefront_slug"`
	CreatedAt        string `json:"created_at"`
	Currency         string `json:"currency"`
	CurrencyExponent int32  `json:"currency_exponent"`
	TotalMinor       string `json:"total_minor"`
	CommercialStatus string `json:"commercial_status"`
	PaymentStatus    string `json:"payment_status"`
	FulfilmentStatus string `json:"fulfilment_status"`
	OrderURL         string `json:"order_url,omitempty"`
}

type VerifyShopperLoginInput struct {
	Email string `json:"email"`
	Code  string `json:"code"`
	Token string `json:"token"`
}

func shopperProfileFromRow(row db.Shopper) ShopperProfileView {
	var addrs []string
	if len(row.SavedAddresses) > 0 {
		_ = json.Unmarshal(row.SavedAddresses, &addrs)
	}
	if addrs == nil {
		addrs = []string{}
	}
	return ShopperProfileView{
		Email:          row.Email,
		Name:           nullableText(row.Name),
		Phone:          nullableText(row.Phone),
		SavedAddresses: addrs,
	}
}

func normalizeShopperEmail(raw string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" || len(trimmed) > 254 {
		return "", errors.New("valid email address is required")
	}
	parsed, err := mail.ParseAddress(trimmed)
	if err != nil || strings.ToLower(strings.TrimSpace(parsed.Address)) != trimmed {
		return "", errors.New("valid email address is required")
	}
	return trimmed, nil
}

// RequestShopperLoginCode always returns the exact same public message so callers cannot
// enumerate which emails have placed orders on Rekordly storefronts.
func (s *Service) RequestShopperLoginCode(ctx context.Context, rawEmail, storeSlug, clientIP string) (string, error) {
	const uniformReply = "If you have orders, we've sent a code"
	cleanEmail, err := normalizeShopperEmail(rawEmail)
	if err != nil {
		return "", err
	}
	ipHash := hashOpaqueToken(strings.TrimSpace(clientIP))
	if ipHash != "" {
		if recentIP, ipErr := s.queries.CountRecentShopperCodesByIP(ctx, ipHash); ipErr == nil && recentIP >= 15 {
			return "", ErrShopperRateLimited
		}
	}
	if recentEmail, eErr := s.queries.CountRecentShopperCodesByEmail(ctx, cleanEmail); eErr == nil && recentEmail >= 5 {
		return uniformReply, nil
	}

	var hasOrdersOrAccount bool
	_ = s.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM storefront_orders WHERE lower(btrim(customer_email)) = $1)
		    OR EXISTS (SELECT 1 FROM shoppers WHERE lower(btrim(email)) = $1)
	`, cleanEmail).Scan(&hasOrdersOrAccount)

	if !hasOrdersOrAccount {
		return uniformReply, nil
	}

	code, err := generateSixDigitOTP()
	if err != nil {
		return "", err
	}
	linkToken, err := randomHexToken(24)
	if err != nil {
		return "", err
	}
	expAt := time.Now().UTC().Add(10 * time.Minute)
	if _, err := s.queries.CreateShopperLoginCodeWithLink(ctx, db.CreateShopperLoginCodeWithLinkParams{
		Btrim:         cleanEmail,
		CodeHash:      hashOpaqueToken(code),
		LinkTokenHash: pgtype.Text{String: hashOpaqueToken(linkToken), Valid: true},
		ExpiresAt:     pgtype.Timestamptz{Time: expAt, Valid: true},
		IpHash:        ipHash,
	}); err != nil {
		return "", err
	}

	if s.emailProvider != nil {
		cleanSlug := strings.TrimSpace(storeSlug)
		signInURL := fmt.Sprintf("%s/orders?token=%s", s.frontendOrigin(), url.QueryEscape(linkToken))
		if cleanSlug != "" {
			signInURL = fmt.Sprintf("%s/s/%s/orders?token=%s", s.frontendOrigin(), url.PathEscape(cleanSlug), url.QueryEscape(linkToken))
		}
		_, _ = s.emailProvider.SendEmail(ctx, notify.SendEmailRequest{
			To:      cleanEmail,
			Subject: "Your Rekordly order tracking code",
			TextBody: fmt.Sprintf(
				"Your Rekordly verification code is %s (expires in 10 minutes).\nOr sign in directly: %s",
				code, signInURL,
			),
			HTMLBody: fmt.Sprintf(
				"<p>Your Rekordly order tracking code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:4px;\">%s</p><p>This code expires in 10 minutes.</p><p><a href=\"%s\">View your orders</a></p>",
				code, signInURL,
			),
		})
	}
	return uniformReply, nil
}

func (s *Service) VerifyShopperLogin(ctx context.Context, in VerifyShopperLoginInput) (string, ShopperProfileView, error) {
	now := time.Now().UTC()
	var row db.ShopperLoginCode
	var err error

	rawToken := strings.TrimSpace(in.Token)
	if rawToken != "" {
		row, err = s.queries.GetShopperLoginCodeByLinkHash(ctx, pgtype.Text{
			String: hashOpaqueToken(rawToken),
			Valid:  true,
		})
		if err != nil {
			return "", ShopperProfileView{}, ErrShopperCodeInvalid
		}
		if row.UsedAt.Valid || row.ExpiresAt.Time.Before(now) || row.Attempts >= 5 {
			return "", ShopperProfileView{}, ErrShopperCodeInvalid
		}
	} else {
		cleanEmail, eErr := normalizeShopperEmail(in.Email)
		cleanCode := strings.TrimSpace(in.Code)
		if eErr != nil || cleanCode == "" {
			return "", ShopperProfileView{}, ErrShopperCodeInvalid
		}
		row, err = s.queries.GetLatestShopperLoginCode(ctx, cleanEmail)
		if err != nil {
			return "", ShopperProfileView{}, ErrShopperCodeInvalid
		}
		if row.UsedAt.Valid || row.ExpiresAt.Time.Before(now) || row.Attempts >= 5 {
			return "", ShopperProfileView{}, ErrShopperCodeInvalid
		}
		expectedHash := []byte(row.CodeHash)
		actualHash := []byte(hashOpaqueToken(cleanCode))
		if len(expectedHash) != len(actualHash) || subtle.ConstantTimeCompare(expectedHash, actualHash) != 1 {
			_, _ = s.queries.IncrementShopperLoginCodeAttempts(ctx, row.ID)
			return "", ShopperProfileView{}, ErrShopperCodeInvalid
		}
	}

	if _, err := s.queries.MarkShopperLoginCodeUsed(ctx, row.ID); err != nil {
		return "", ShopperProfileView{}, err
	}

	var latestName string
	var latestPhone pgtype.Text
	_ = s.pool.QueryRow(ctx, `
		SELECT customer_name, customer_phone
		FROM storefront_orders
		WHERE lower(btrim(customer_email)) = $1
		ORDER BY id DESC
		LIMIT 1
	`, row.ShopperEmail).Scan(&latestName, &latestPhone)

	shopper, err := s.queries.UpsertShopper(ctx, db.UpsertShopperParams{
		Btrim: row.ShopperEmail,
		Name:  optionalPgText(latestName),
		Phone: latestPhone,
	})
	if err != nil {
		return "", ShopperProfileView{}, err
	}
	if err := s.queries.LinkOrdersToShopperByEmail(ctx, db.LinkOrdersToShopperByEmailParams{
		ShopperID: pgtype.Int8{Int64: shopper.ID, Valid: true},
		Btrim:     shopper.Email,
	}); err != nil {
		return "", ShopperProfileView{}, err
	}

	sessionToken, err := randomHexToken(32)
	if err != nil {
		return "", ShopperProfileView{}, err
	}
	if _, err := s.queries.CreateShopperSession(ctx, db.CreateShopperSessionParams{
		TokenHash: hashOpaqueToken(sessionToken),
		ShopperID: shopper.ID,
		ExpiresAt: pgtype.Timestamptz{Time: now.Add(30 * 24 * time.Hour), Valid: true},
	}); err != nil {
		return "", ShopperProfileView{}, err
	}

	return sessionToken, shopperProfileFromRow(shopper), nil
}

func (s *Service) ResolveShopperIDBySessionToken(ctx context.Context, rawToken string) (int64, error) {
	trimmed := strings.TrimSpace(rawToken)
	if trimmed == "" {
		return 0, ErrShopperUnauthenticated
	}
	sess, err := s.queries.GetShopperSession(ctx, hashOpaqueToken(trimmed))
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrShopperUnauthenticated
	}
	if err != nil {
		return 0, err
	}
	_ = s.queries.TouchShopperSession(ctx, sess.TokenHash)
	return sess.ShopperID, nil
}

func (s *Service) GetShopperProfile(ctx context.Context, rawToken string) (ShopperProfileView, error) {
	shopperID, err := s.ResolveShopperIDBySessionToken(ctx, rawToken)
	if err != nil {
		return ShopperProfileView{}, err
	}
	shopper, err := s.queries.GetShopperByID(ctx, shopperID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ShopperProfileView{}, ErrShopperUnauthenticated
	}
	if err != nil {
		return ShopperProfileView{}, err
	}
	return shopperProfileFromRow(shopper), nil
}

func (s *Service) ListShopperOrdersView(ctx context.Context, rawToken, storeSlug string) ([]ShopperOrderSummaryView, error) {
	shopperID, err := s.ResolveShopperIDBySessionToken(ctx, rawToken)
	if err != nil {
		return nil, err
	}
	var slugParam pgtype.Text
	if cleanSlug := strings.TrimSpace(storeSlug); cleanSlug != "" {
		slugParam = pgtype.Text{String: cleanSlug, Valid: true}
	}
	rows, err := s.queries.ListShopperOrders(ctx, db.ListShopperOrdersParams{
		ShopperID:      pgtype.Int8{Int64: shopperID, Valid: true},
		StorefrontSlug: slugParam,
	})
	if err != nil {
		return nil, err
	}
	out := make([]ShopperOrderSummaryView, 0, len(rows))
	for _, r := range rows {
		orderURL := ""
		if r.PublicTokenEnc.Valid && strings.TrimSpace(r.PublicTokenEnc.String) != "" {
			if rawTok, decErr := crypto.Decrypt(r.PublicTokenEnc.String); decErr == nil && strings.TrimSpace(rawTok) != "" {
				orderURL = "/orders/status/" + url.PathEscape(strings.TrimSpace(rawTok))
			}
		}
		out = append(out, ShopperOrderSummaryView{
			OrderReference:   r.OrderReference,
			StorefrontName:   r.StorefrontName,
			StorefrontSlug:   r.StorefrontSlug,
			CreatedAt:        r.CreatedAt.Time.UTC().Format(time.RFC3339),
			Currency:         r.Currency,
			CurrencyExponent: r.CurrencyExponent,
			TotalMinor:       fmt.Sprint(r.TotalMinor),
			CommercialStatus: r.CommercialStatus,
			PaymentStatus:    r.PaymentStatus,
			FulfilmentStatus: r.FulfilmentStatus,
			OrderURL:         orderURL,
		})
	}
	return out, nil
}

func (s *Service) LogoutShopper(ctx context.Context, rawToken string) error {
	trimmed := strings.TrimSpace(rawToken)
	if trimmed == "" {
		return nil
	}
	return s.queries.DeleteShopperSession(ctx, hashOpaqueToken(trimmed))
}

func (s *Service) saveShopperDetails(ctx context.Context, shopperID int64, name, phone, address string) {
	if shopperID <= 0 {
		return
	}
	shopper, err := s.queries.GetShopperByID(ctx, shopperID)
	if err != nil {
		return
	}
	var existing []string
	if len(shopper.SavedAddresses) > 0 {
		_ = json.Unmarshal(shopper.SavedAddresses, &existing)
	}
	cleanAddr := sanitizePublicText(address, 300)
	if cleanAddr != "" {
		deduped := []string{cleanAddr}
		for _, a := range existing {
			if !strings.EqualFold(strings.TrimSpace(a), cleanAddr) {
				deduped = append(deduped, a)
			}
			if len(deduped) >= 5 {
				break
			}
		}
		existing = deduped
	}
	if existing == nil {
		existing = []string{}
	}
	addrJSON, _ := json.Marshal(existing)
	_, _ = s.queries.UpdateShopperDetails(ctx, db.UpdateShopperDetailsParams{
		ID:             shopperID,
		Name:           optionalPgText(sanitizePublicText(name, 160)),
		Phone:          optionalPgText(sanitizePublicText(phone, 50)),
		SavedAddresses: addrJSON,
	})
}
