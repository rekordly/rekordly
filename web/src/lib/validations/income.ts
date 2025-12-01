// @/lib/validations/income.ts
import { z } from 'zod';
import { IncomeMainCategory, IncomeSubCategory } from '@/types/income';
import { PaymentMethodSchema } from '@/lib/validations/general';

// Validation schema
export const addIncomeSchema = z.object({
  mainCategory: z.nativeEnum(IncomeMainCategory, {
    error: 'Main category is required. Please select a valid main category',
  }),

  subCategory: z
    .string()
    .min(1, 'Sub category is required')
    .max(100, 'Sub category must be less than 100 characters')
    .transform(val => val.trim()),

  grossAmount: z
    .number({
      error: 'Amount is required and must be a number',
    })
    .positive('Amount must be greater than 0')
    .finite('Amount must be a valid number'),

  taxablePercentage: z
    .number({
      error: 'Taxable percentage is required',
    })
    .min(0, 'Taxable percentage cannot be negative')
    .max(100, 'Taxable percentage cannot be more than 100'),

  description: z
    .string()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .transform(val => val?.trim()),

  date: z
    .string()
    .min(1, 'Date is required')
    .refine(
      val => {
        const date = new Date(val);
        return !isNaN(date.getTime());
      },
      {
        message: 'Please provide a valid date',
      }
    ),
  paymentMethod: PaymentMethodSchema,
  reference: z.string().optional(),
});

export type AddIncomeType = z.infer<typeof addIncomeSchema>;
