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
