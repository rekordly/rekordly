import { z } from 'zod';
import { ExpenseCategory } from '@/types/expenses';
import { PaymentMethodSchema } from '@/lib/validations/general';

// Validation schema for adding an expense
export const addExpenseSchema = z.object({
  category: z.nativeEnum(ExpenseCategory, {
    error: 'Category is required. Please select a valid expense category',
  }),

  subCategory: z
    .string()
    .min(1, 'Sub category is required')
    .max(100, 'Sub category must be less than 100 characters')
    .transform(val => val.trim()),

  amount: z
    .number({
      error: 'Amount is required and must be a number',
    })
    .positive('Amount must be greater than 0')
    .finite('Amount must be a valid number'),

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

  vendorName: z
    .string()
    .min(3, 'Vendor name must be at least 3 characters')
    .max(100, 'Vendor name must be less than 100 characters')
    .optional()
    .transform(val => val?.trim()),

  isDeductible: z.boolean().default(true),

  deductionPercentage: z
    .number()
    .min(0, 'Deduction percentage cannot be negative')
    .max(100, 'Deduction percentage cannot be more than 100')
    .optional(),

  receipt: z
    .string()
    .max(50, 'Receipt reference must be less than 50 characters')
    .optional()
    .transform(val => val?.trim()),

  paymentMethod: PaymentMethodSchema,
  reference: z.string().optional(),
});
