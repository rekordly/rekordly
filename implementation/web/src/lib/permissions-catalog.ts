/** Capability codes the app shell checks. The API remains the enforcement point. */
export const PERMISSIONS = {
  MONEY_VIEW: "money.view",
  SALES_VIEW: "sales.view",
  PURCHASES_VIEW: "purchases.view",
  INVENTORY_VIEW_QUANTITY: "inventory.view_quantity",
  STOREFRONT_VIEW: "storefront.view",
  REPORTS_VIEW_BASIC: "reports.view_basic",
} as const;

export const WILDCARD_PERMISSION = "*";
