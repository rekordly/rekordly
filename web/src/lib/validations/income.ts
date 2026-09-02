// @/lib/validations/income.ts
import { z } from 'zod';
import { IncomeMainCategory } from '@/types/income';
import { PaymentMethod } from '@prisma/client';
import { dateStringSchema } from '@/lib/validations/date';

// Validation schema for adding income
export const addIncomeSchema = z
  .object({
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

    date: dateStringSchema('Date is required'),

    // Payment tracking fields
    amountPaid: z
      .number()
      .min(0, 'Amount paid cannot be negative')
      .optional()
      .default(0),

    paymentMethod: z
      .nativeEnum(PaymentMethod, {
        error: 'Payment method is required when amount is received',
      })
      .optional(),

    reference: z
      .string()
      .max(50, 'Reference must be less than 50 characters')
      .optional()
      .transform(val => val?.trim()),
  })
  .refine(
    data => {
      // Amount paid cannot exceed gross amount
      if (data.amountPaid && data.amountPaid > 0) {
        return data.amountPaid <= data.grossAmount;
      }
      return true;
    },
    {
      message: 'Amount received cannot be greater than gross amount',
      path: ['amountPaid'],
    }
  )
  .refine(
    data => {
      // If amount paid > 0, payment method is required
      if (data.amountPaid && data.amountPaid > 0) {
        return !!data.paymentMethod;
      }
      return true;
    },
    {
      message: 'Payment method is required when recording payment',
      path: ['paymentMethod'],
    }
  );

export type AddIncomeType = z.infer<typeof addIncomeSchema>;
