// @/lib/validations/expenses.ts
import { z } from 'zod';
import { ExpenseCategory } from '@/types/expenses';
import { PaymentMethod } from '@prisma/client';
import { dateStringSchema } from '@/lib/validations/date';

// Validation schema for adding an expense
export const addExpenseSchema = z
  .object({
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

    date: dateStringSchema('Date is required'),

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

    // Payment tracking fields
    amountPaid: z
      .number()
      .min(0, 'Amount paid cannot be negative')
      .optional()
      .default(0),

    paymentMethod: z
      .nativeEnum(PaymentMethod, {
        error: 'Payment method is required when amount is paid',
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
      // Amount paid cannot exceed total amount
      if (data.amountPaid && data.amountPaid > 0) {
        return data.amountPaid <= data.amount;
      }
      return true;
    },
    {
      message: 'Amount paid cannot be greater than total amount',
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
