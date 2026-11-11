import { z } from "zod";

// Amounts stay decimal strings; the API converts them to minor units.
const amount = (message = "Enter an amount like 2500 or 2500.50") =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, message)
    .refine((value) => /[1-9]/.test(value), "Amount must be more than zero");

const optionalAmount = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d+(\.\d+)?$/.test(value), "Enter an amount like 2500 or 2500.50");

const date = (message = "Choose a date") => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message);
const shortText = z.string().trim().max(200, "Keep this under 200 characters");
const notes = z.string().trim().max(1000, "Keep this under 1000 characters");

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name this account").max(120, "Keep this under 120 characters"),
  account_type: z.enum(["cash", "bank", "mobile_wallet", "clearing", "other"], { message: "Choose an account type" }),
  opening_balance: optionalAmount,
});
export type AccountValues = z.infer<typeof accountSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name this category").max(120, "Keep this under 120 characters"),
  direction: z.enum(["money_in", "money_out", "both"], { message: "Choose how it is used" }),
});
export type CategoryValues = z.infer<typeof categorySchema>;

export const catalogueItemSchema = z.object({
  name: z.string().trim().min(1, "Enter an item name").max(200, "Keep this under 200 characters"),
  kind: z.enum(["service", "non_stock", "stock_tracked"], { message: "Choose what you sell" }),
  status: z.enum(["active", "draft"]),
  unit_name: z.string().trim().min(1, "Enter a unit").max(40, "Keep this under 40 characters"),
  selling_price: amount("Enter a selling price"),
  sku: z.string().trim().max(80, "Keep this under 80 characters"),
  description: notes,
});
export type CatalogueItemValues = z.infer<typeof catalogueItemSchema>;

const quantity = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, "Enter a quantity with up to 4 decimal places")
  .refine((value) => /[1-9]/.test(value), "Quantity must be more than zero");

export const openingStockSchema = z.object({
  product_id: z.string().min(1, "Choose a stock product"),
  location_id: z.string().optional(),
  quantity,
  unit_cost: amount("Enter the unit cost"),
  effective_on: date(),
  reason: z.string().trim().min(1, "Explain this opening balance").max(500, "Keep this under 500 characters"),
});
export type OpeningStockValues = z.infer<typeof openingStockSchema>;

export const outletSchema = z.object({
  name: z.string().trim().min(1, "Enter an outlet name").max(100, "Keep under 100 characters"),
  location_type: z.enum(["outlet", "warehouse", "store", "other"]),
  code: z.string().trim().max(30).optional(),
  address: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
});
export type OutletValues = z.infer<typeof outletSchema>;

export const productOptionSchema = z.object({
  name: z.string().trim().min(1, "Enter an option name (e.g. Size, Color)").max(100),
  values: z.string().trim().min(1, "Enter comma-separated values (e.g. Small, Medium, Large)"),
});
export type ProductOptionValues = z.infer<typeof productOptionSchema>;

export const productVariantSchema = z.object({
  name: z.string().trim().min(1, "Enter variant name").max(100),
  selling_price: amount("Enter selling price"),
  cost_price: z.string().trim().optional(),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(80).optional(),
});
export type ProductVariantValues = z.infer<typeof productVariantSchema>;

export const stockReservationSchema = z.object({
  product_id: z.string().min(1, "Choose a product"),
  location_id: z.string().optional(),
  quantity,
  notes: notes,
});
export type StockReservationValues = z.infer<typeof stockReservationSchema>;

export const stockTransferSchema = z.object({
  source_location_id: z.string().min(1, "Choose source location"),
  destination_location_id: z.string().min(1, "Choose destination location"),
  product_id: z.string().min(1, "Choose a product to transfer"),
  quantity: quantity,
  notes: notes,
});
export type StockTransferValues = z.infer<typeof stockTransferSchema>;

export const stockCountSchema = z.object({
  location_id: z.string().min(1, "Choose location to audit"),
  scope: z.enum(["full", "category", "custom"]),
  notes: notes,
});
export type StockCountValues = z.infer<typeof stockCountSchema>;

export const stockAdjustmentSchema = z.object({
  location_id: z.string().min(1, "Choose location"),
  reason_code: z.enum(["damage", "spoilage", "shrinkage", "internal_use", "correction", "other"]),
  product_id: z.string().min(1, "Choose product"),
  quantity_delta: z.string().trim().min(1, "Enter quantity delta (e.g. -2 for damage, +1 for found)"),
  unit_cost: z.string().trim().optional(),
  notes: notes,
});
export type StockAdjustmentValues = z.infer<typeof stockAdjustmentSchema>;

export const purchaseRequestSchema = z.object({
  supplier_id: z.string(),
  needed_by: z.union([z.literal(""), date("Choose a valid date")]),
  reason: z.string().trim().min(1, "Explain why this is needed").max(1000, "Keep this under 1000 characters"),
  reference: shortText,
	priority: z.enum(["low", "normal", "high", "urgent"]),
  lines: z
    .array(
      z.object({
        product_id: z.string(),
        description: z.string().trim().min(1, "Describe what is needed").max(240, "Keep this under 240 characters"),
        quantity,
        unit_name: z.string().trim().min(1, "Enter a unit").max(40, "Keep this under 40 characters"),
        estimated_unit_price: amount("Enter an estimated unit price"),
      }),
    )
    .min(1, "Add at least one request line")
    .max(100, "A request can have at most 100 lines"),
});
export type PurchaseRequestValues = z.infer<typeof purchaseRequestSchema>;

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(160, "Keep this under 160 characters"),
  email: z.union([z.literal(""), z.email("Enter a valid email address")]),
  phone: shortText,
  notes,
});
export type ContactValues = z.infer<typeof contactSchema>;

export const tradeSchema = z.object({
  party_id: z.string(),
  party_name: shortText,
  date: date(),
  amount: amount(),
  category_id: z.string(),
  reference: shortText,
  notes,
  account_id: z.string(),
});
export type TradeValues = z.infer<typeof tradeSchema>;

export const paymentSchema = z.object({
  direction: z.enum(["incoming", "outgoing"]),
  date: date(),
  amount: amount(),
  account_id: z.string().min(1, "Choose an account"),
  party_name: z.string().trim().min(1, "Enter who this payment is with").max(200, "Keep this under 200 characters"),
  reference: shortText,
  notes,
});
export type PaymentValues = z.infer<typeof paymentSchema>;

export const invoiceAllocationSchema = z.object({
  customer_id: z.string().min(1, "Choose a customer"),
  date: date(),
  amount: amount(),
  account_id: z.string().min(1, "Choose the account that received it"),
  allocations: z.record(z.string(), optionalAmount),
  reference: shortText,
  notes,
});
export type InvoiceAllocationValues = z.infer<typeof invoiceAllocationSchema>;

export const invoiceSchema = z
  .object({
    customer_id: z.string().min(1, "Choose a customer"),
    issue_date: date("Choose the issue date"),
    due_date: date("Choose the due date"),
    tax_amount: optionalAmount,
    notes,
    terms: notes,
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1, "Describe this item").max(200, "Keep this under 200 characters"),
          quantity: z.string().regex(/^[1-9]\d{0,5}$/, "Enter a whole quantity"),
          unit_price: amount("Enter a price"),
        }),
      )
      .min(1, "Add at least one item"),
  })
  .refine((values) => values.due_date >= values.issue_date, {
    path: ["due_date"],
    message: "The due date cannot be before the issue date",
  });
export type InvoiceValues = z.infer<typeof invoiceSchema>;

export const estimateSchema = z.object({
  customer_id: z.string().min(1, "Customer name is required"),
  issue_date: date("Choose the issue date"),
  expiry_date: date("Choose the expiry date"),
  tax_amount: optionalAmount,
  notes,
  terms: notes,
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Describe this item").max(200, "Keep this under 200 characters"),
        quantity: z.string().regex(/^[0-9]+(\.[0-9]{1,4})?$/, "Enter a valid quantity"),
        unit_price: amount("Enter a price"),
      }),
    )
    .min(1, "Add at least one item"),
});
export type EstimateValues = z.infer<typeof estimateSchema>;

export const salesReturnSchema = z.object({
  return_date: date("Choose return date"),
  reason: z.string().trim().min(1, "Reason for return is required").max(300),
  action_taken: z.enum(["customer_credit", "refund", "invoice_reduction"]),
  tax_amount: optionalAmount,
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Item description is required"),
        quantity: z.string().regex(/^[0-9]+(\.[0-9]{1,4})?$/, "Enter a valid quantity"),
        unit_price: amount("Enter unit price"),
        restock_inventory: z.boolean(),
      }),
    )
    .min(1, "Add at least one item to return"),
});
export type SalesReturnValues = z.infer<typeof salesReturnSchema>;

export const walletDepositSchema = z.object({
  amount: amount(),
  account_id: z.string().min(1, "Choose the account that received it"),
  reference: shortText,
  notes,
});
export type WalletDepositValues = z.infer<typeof walletDepositSchema>;

export const walletPaymentSchema = z.object({ amount: amount() });
export type WalletPaymentValues = z.infer<typeof walletPaymentSchema>;

export const budgetSchema = z
  .object({
    name: z.string().trim().min(1, "Name this budget").max(120, "Keep this under 120 characters"),
    amount: amount(),
    period: z.enum(["monthly", "quarterly", "annual", "custom"], { message: "Choose a period" }),
    category_id: z.string(),
    start_date: date("Choose a start date"),
    end_date: date("Choose an end date"),
    notes,
  })
  .refine((values) => values.end_date >= values.start_date, {
    path: ["end_date"],
    message: "The end date cannot be before the start date",
  });
export type BudgetValues = z.infer<typeof budgetSchema>;

export const taxSettingsSchema = z.object({
  tax_identification_number: z.string().trim().max(40, "Keep this under 40 characters"),
  vat_rate: z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter a rate like 7.5"),
  is_vat_registered: z.enum(["yes", "no"]),
});
export type TaxSettingsValues = z.infer<typeof taxSettingsSchema>;
