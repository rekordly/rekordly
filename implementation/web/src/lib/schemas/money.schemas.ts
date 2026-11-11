import { z } from "zod";

const DECIMAL_AMOUNT = /^\d+(\.\d+)?$/;

export const moneyCaptureSchema = z
  .object({
    direction: z.enum(["money_in", "money_out", "transfer"]),
    // A string on purpose: money is never parsed into a JavaScript number.
    amount: z
      .string()
      .trim()
      .regex(DECIMAL_AMOUNT, "Enter an amount like 2500 or 2500.50")
      .refine((value) => /[1-9]/.test(value), "Amount must be more than zero"),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    money_account_id: z.string().min(1, "Choose an account"),
    destination_account_id: z.string(),
    category_id: z.string(),
    purpose: z.string().trim().max(200),
    counterparty_name: z.string().trim().max(200),
    notes: z.string().trim().max(1000),
  })
  .superRefine((values, context) => {
    if (values.direction !== "transfer") return;
    if (!values.destination_account_id) {
      context.addIssue({
        code: "custom",
        path: ["destination_account_id"],
        message: "Choose where the money went",
      });
    } else if (values.destination_account_id === values.money_account_id) {
      context.addIssue({
        code: "custom",
        path: ["destination_account_id"],
        message: "Choose a different account",
      });
    }
  });

export type MoneyCaptureValues = z.infer<typeof moneyCaptureSchema>;

// moneyCaptureSchema already has a cross-field refinement. Zod v4 rejects
// `.extend()` on that kind of schema because it could overwrite a refined key;
// safeExtend preserves the transfer validation while adding draft-only fields.
export const moneyRecordDraftSchema = moneyCaptureSchema.safeExtend({
  entry_method: z.enum(["manual", "ai_assisted"]),
  purpose: z.string().trim().min(1, "Choose what this money represents").max(200),
  reference: z.string().trim().max(200),
}).superRefine((values, context) => {
  const purposeWithoutCategory = ["transfer", "not_yet_known", "not_yet_classified", "customer_advance", "supplier_advance", "loan_proceeds", "loan_repayment", "owner_capital", "owner_drawing", "tax_payment", "tax_refund"];
  if (values.direction !== "transfer" && !purposeWithoutCategory.includes(values.purpose) && !values.category_id) {
    context.addIssue({
      code: "custom",
      path: ["category_id"],
      message: "Choose a category for this purpose",
    });
  }
  if (["customer_advance", "supplier_advance", "customer_refund", "supplier_refund", "loan_proceeds", "loan_repayment", "owner_capital", "owner_drawing"].includes(values.purpose) && !values.counterparty_name.trim()) {
    context.addIssue({
      code: "custom",
      path: ["counterparty_name"],
      message: "Add the customer, supplier, lender or owner for this purpose",
    });
  }
});

export type MoneyRecordDraftValues = z.infer<typeof moneyRecordDraftSchema>;

const mixedAmount = z
  .string()
  .trim()
  .regex(DECIMAL_AMOUNT, "Enter an amount like 2500 or 2500.50")
  .refine((value) => /[1-9]/.test(value), "Amount must be more than zero");

/**
 * The values remain strings: the API alone converts to minor units and checks
 * that Personal plus Business equals the total exactly.
 */
export const mixedExpenseSchema = z.object({
  paying_workspace_kind: z.enum(["personal", "business"]),
  paying_money_account_id: z.string().min(1, "Choose the account that paid"),
  total_amount: mixedAmount,
  personal_amount: mixedAmount,
  business_amount: mixedAmount,
  personal_category_id: z.string().min(1, "Choose a Personal category"),
  business_category_id: z.string().min(1, "Choose a Business category"),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  description: z.string().trim().max(1_000),
  reference: z.string().trim().max(200),
});

export type MixedExpenseValues = z.infer<typeof mixedExpenseSchema>;

export const mixedReimbursementSchema = z.object({
  amount: mixedAmount,
  from_money_account_id: z.string().min(1, "Choose the account paying the reimbursement"),
  to_money_account_id: z.string().min(1, "Choose the account receiving the reimbursement"),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  reference: z.string().trim().max(200),
});

export type MixedReimbursementValues = z.infer<typeof mixedReimbursementSchema>;
