import { z } from "zod";

const moneyString = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .regex(/^\d+(\.\d{1,4})?$/, "Enter a valid positive amount");

const optionalMoneyString = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d{1,4})?$/.test(v), "Enter a valid amount");

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");

export const openingBalanceSchema = z.object({
  amount: moneyString,
  as_of_date: dateString,
  note: z.string().max(300).optional(),
});
export type OpeningBalanceValues = z.infer<typeof openingBalanceSchema>;

export const loanCreateSchema = z.object({
  direction: z.enum(["borrowed", "lent"]),
  counterparty_name: z.string().trim().min(1, "Counterparty is required").max(160),
  principal: moneyString,
  start_date: dateString,
  due_date: z.string().optional(),
  money_account_id: z.string().optional(),
  is_opening_balance: z.boolean(),
  notes: z.string().max(500).optional(),
});
export type LoanCreateValues = z.infer<typeof loanCreateSchema>;

export const loanRepaymentSchema = z.object({
  money_account_id: z.string().min(1, "Select an account"),
  effective_date: dateString,
  total_amount: moneyString,
  principal: moneyString,
  interest: optionalMoneyString,
  fee: optionalMoneyString,
  notes: z.string().max(500).optional(),
});
export type LoanRepaymentValues = z.infer<typeof loanRepaymentSchema>;

export const investmentCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  investment_type: z.enum(["shares_funds", "fixed_income", "crypto", "cooperative", "other"]),
  institution_name: z.string().max(160).optional(),
  notes: z.string().max(500).optional(),
});
export type InvestmentCreateValues = z.infer<typeof investmentCreateSchema>;

export const investmentEventSchema = z.object({
  event_type: z.enum(["purchase", "contribution", "income", "disposal", "opening"]),
  effective_date: dateString,
  amount: moneyString,
  units_delta: z.string().optional(),
  money_account_id: z.string().optional(),
  notes: z.string().max(500).optional(),
});
export type InvestmentEventValues = z.infer<typeof investmentEventSchema>;

export const manualValuationSchema = z.object({
  valuation_date: dateString,
  value: moneyString,
  source: z.string().trim().min(1, "Source is required").max(100),
  notes: z.string().max(500).optional(),
});
export type ManualValuationValues = z.infer<typeof manualValuationSchema>;

export const assetCreateSchema = z.object({
  name: z.string().trim().min(1, "Asset name is required").max(160),
  asset_type: z.enum(["vehicle", "property", "electronics_equipment", "personal_item", "other"]),
  notes: z.string().max(500).optional(),
});
export type AssetCreateValues = z.infer<typeof assetCreateSchema>;

export const assetAcquireSchema = z.object({
  acquisition_date: dateString,
  cost: moneyString,
  is_opening_asset: z.boolean(),
  money_account_id: z.string().optional(),
  notes: z.string().max(500).optional(),
});
export type AssetAcquireValues = z.infer<typeof assetAcquireSchema>;

export const assetDisposeSchema = z.object({
  disposal_date: dateString,
  proceeds: moneyString,
  disposal_costs: optionalMoneyString,
  money_account_id: z.string().min(1, "Select receiving account"),
  counterparty_name: z.string().max(160).optional(),
  notes: z.string().max(500).optional(),
});
export type AssetDisposeValues = z.infer<typeof assetDisposeSchema>;

export const ownerTransferSchema = z.object({
  from_workspace_id: z.string().min(1, "Select source space"),
  to_workspace_id: z.string().min(1, "Select destination space"),
  from_money_account_id: z.string().min(1, "Select source account"),
  to_money_account_id: z.string().min(1, "Select destination account"),
  purpose: z.enum([
    "owner_capital_contribution",
    "owner_loan",
    "owner_loan_repayment",
    "owner_drawing_distribution",
    "business_expense_reimbursement",
    "personal_expense_paid_for_business",
  ]),
  amount: moneyString,
  effective_date: dateString,
  notes: z.string().max(500).optional(),
  reference: z.string().max(120).optional(),
});
export type OwnerTransferValues = z.infer<typeof ownerTransferSchema>;
