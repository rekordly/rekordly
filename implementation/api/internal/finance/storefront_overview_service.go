package finance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/rekordly/rekordly-api/internal/db"
)

type StorefrontOverviewDailyView struct {
	Date                string `json:"date"`
	PageViews           int64  `json:"page_views"`
	Visitors            int64  `json:"visitors"`
	ProductViews        int64  `json:"product_views"`
	AddToCarts          int64  `json:"add_to_carts"`
	CheckoutsStarted    int64  `json:"checkouts_started"`
	CheckoutsSubmitted  int64  `json:"checkouts_submitted"`
	PaidOrders          int64  `json:"paid_orders"`
	SalesMinor          string `json:"sales_minor"`
}

type StorefrontOverviewView struct {
	Storefront              StorefrontView                               `json:"storefront"`
	Period                  string                                       `json:"period"`
	SinceDate               string                                       `json:"since_date"`
	Currency                string                                       `json:"currency"`
	CurrencyExponent        int32                                        `json:"currency_exponent"`
	SalesMinor              string                                       `json:"sales_minor"`
	PaidOrders              int64                                        `json:"paid_orders"`
	Visitors                int64                                        `json:"visitors"`
	PageViews               int64                                        `json:"page_views"`
	ConversionRate          string                                       `json:"conversion_rate"`
	AverageOrderValueMinor  string                                       `json:"average_order_value_minor"`
	Daily                   []StorefrontOverviewDailyView                `json:"daily"`
	Funnel                  map[string]int64                             `json:"funnel"`
	Referrers               []db.GetStorefrontOverviewReferrersRow       `json:"referrers"`
	TopProducts             []db.GetStorefrontOverviewTopProductsRow     `json:"top_products"`
	NeedsAction             db.GetStorefrontOverviewActionCountsRow      `json:"needs_action"`
}

func (s *Service) GetStorefrontOverview(ctx context.Context, workspaceID int64, period string) (StorefrontOverviewView, error) {
	days := 30
	switch period {
	case "7d":
		days = 7
	case "30d":
		days = 30
	case "90d":
		days = 90
	default:
		return StorefrontOverviewView{}, fmt.Errorf("period must be 7d, 30d, or 90d")
	}

	sf, err := s.queries.GetStorefrontByWorkspace(ctx, workspaceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontOverviewView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontOverviewView{}, err
	}
	view, err := s.buildStorefrontView(ctx, sf)
	if err != nil {
		return StorefrontOverviewView{}, err
	}

	since := time.Now().UTC().Truncate(24 * time.Hour).AddDate(0, 0, -(days - 1))
	date := pgtype.Date{Time: since, Valid: true}
	base := db.GetStorefrontOverviewTotalsParams{WorkspaceID: workspaceID, StorefrontID: sf.ID, OccurredOn: date}
	totals, err := s.queries.GetStorefrontOverviewTotals(ctx, base)
	if err != nil {
		return StorefrontOverviewView{}, err
	}
	daily, err := s.queries.GetStorefrontOverviewDaily(ctx, db.GetStorefrontOverviewDailyParams{
		WorkspaceID: workspaceID, StorefrontID: sf.ID, Column3: date,
	})
	if err != nil {
		return StorefrontOverviewView{}, err
	}
	refs, err := s.queries.GetStorefrontOverviewReferrers(ctx, db.GetStorefrontOverviewReferrersParams{
		WorkspaceID: workspaceID, StorefrontID: sf.ID, OccurredOn: date,
	})
	if err != nil {
		return StorefrontOverviewView{}, err
	}
	products, err := s.queries.GetStorefrontOverviewTopProducts(ctx, db.GetStorefrontOverviewTopProductsParams{
		WorkspaceID: workspaceID, StorefrontID: sf.ID, OccurredOn: date,
	})
	if err != nil {
		return StorefrontOverviewView{}, err
	}
	actions, err := s.queries.GetStorefrontOverviewActionCounts(ctx, db.GetStorefrontOverviewActionCountsParams{
		WorkspaceID: workspaceID, StorefrontID: sf.ID,
	})
	if err != nil {
		return StorefrontOverviewView{}, err
	}

	conversion := "0.0"
	if totals.Visitors > 0 {
		conversion = fmt.Sprintf("%.1f", float64(totals.PaidOrders)*100/float64(totals.Visitors))
	}
	aov := int64(0)
	if totals.PaidOrders > 0 {
		aov = totals.SalesMinor / totals.PaidOrders
	}
	series := make([]StorefrontOverviewDailyView, 0, len(daily))
	for _, row := range daily {
		series = append(series, StorefrontOverviewDailyView{
			Date: row.Day.Time.Format("2006-01-02"), PageViews: row.PageViews,
			Visitors: row.Visitors, ProductViews: row.ProductViews, AddToCarts: row.AddToCarts,
			CheckoutsStarted: row.CheckoutsStarted, CheckoutsSubmitted: row.CheckoutsSubmitted,
			PaidOrders: row.PaidOrders, SalesMinor: fmt.Sprint(row.SalesMinor),
		})
	}
	if refs == nil {
		refs = []db.GetStorefrontOverviewReferrersRow{}
	}
	if products == nil {
		products = []db.GetStorefrontOverviewTopProductsRow{}
	}

	return StorefrontOverviewView{
		Storefront: view, Period: period, SinceDate: since.Format("2006-01-02"),
		Currency: view.Currency, CurrencyExponent: view.CurrencyExponent,
		SalesMinor: fmt.Sprint(totals.SalesMinor), PaidOrders: totals.PaidOrders,
		Visitors: totals.Visitors, PageViews: totals.PageViews, ConversionRate: conversion,
		AverageOrderValueMinor: fmt.Sprint(aov), Daily: series,
		Funnel: map[string]int64{
			"visits": totals.PageViews, "product_views": totals.ProductViews,
			"add_to_cart": totals.AddToCarts, "checkout_started": totals.CheckoutsStarted,
			"checkout_submitted": totals.CheckoutsSubmitted, "paid": totals.PaidOrders,
		},
		Referrers: refs, TopProducts: products, NeedsAction: actions,
	}, nil
}
