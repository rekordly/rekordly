import {
  LoanStatus,
  LoanType,
  PaymentFrequency,
  TermUnit,
} from '@prisma/client';
import { z } from 'zod';

export const LoanTypeSchema = z.enum(LoanType, {
  error: 'Loan type is required',
});

export const PaymentFrequencySchema = z.enum(PaymentFrequency, {
  error: 'Payment frequency is required',
});

export const TermUnitSchema = z.enum(TermUnit, {
  error: 'Term unit is required',
});

export const LoanStatusSchema = z.enum(LoanStatus, {
  error: 'Loan status is required',
});

// Add/Create Loan Schema
export const addLoanSchema = z.object({
  loanType: LoanTypeSchema,

  // Party details (borrower OR lender depending on loan type)
  partyName: z
    .string()
    .min(1, 'Party name is required')
    .max(200, 'Party name must be less than 200 characters')
    .transform(val => val?.trim()),

  partyEmail: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal(''))
    .transform(val => (val === '' ? undefined : val)),

  partyPhone: z
    .string()
    .max(20, 'Phone number must be less than 20 characters')
    .optional()
    .or(z.literal(''))
    .transform(val => (val === '' ? undefined : val)),

  principalAmount: z
    .number({
      error: 'Principal amount is required and must be a number',
    })
    .positive('Principal amount must be greater than 0')
    .finite('Principal amount must be a valid number'),

  interestRate: z
    .number({
      error: 'Interest rate is required',
    })
    .min(0, 'Interest rate cannot be negative')
    .max(100, 'Interest rate cannot exceed 100%')
    .finite('Interest rate must be a valid number'),

  // Loan charges/fees
  processingFee: z
    .number()
    .min(0, 'Processing fee cannot be negative')
    .finite('Processing fee must be a valid number')
    .optional()
    .default(0),

  managementFee: z
    .number()
    .min(0, 'Management fee cannot be negative')
    .finite('Management fee must be a valid number')
    .optional()
    .default(0),

  insuranceFee: z
    .number()
    .min(0, 'Insurance fee cannot be negative')
    .finite('Insurance fee must be a valid number')
    .optional()
    .default(0),

  otherCharges: z
    .number()
    .min(0, 'Other charges cannot be negative')
    .finite('Other charges must be a valid number')
    .optional()
    .default(0),

  startDate: z
    .string()
    .min(1, 'Start date is required')
    .refine(
      val => {
        const date = new Date(val);
        return !isNaN(date.getTime());
      },
      {
        message: 'Please provide a valid start date',
      }
    ),

  term: z
    .number({
      error: 'Term is required',
    })
    .int('Term must be a whole number')
    .positive('Term must be greater than 0'),

  termUnit: TermUnitSchema,

  paymentFrequency: PaymentFrequencySchema,

  purpose: z
    .string()
    .max(500, 'Purpose must be less than 500 characters')
    .optional()
    .or(z.literal(''))
    .transform(val => (val === '' ? undefined : val?.trim())),

  collateral: z
    .string()
    .max(500, 'Collateral description must be less than 500 characters')
    .optional()
    .or(z.literal(''))
    .transform(val => (val === '' ? undefined : val?.trim())),

  notes: z
    .string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional()
    .or(z.literal(''))
    .transform(val => (val === '' ? undefined : val?.trim())),
});

export type AddLoanType = z.infer<typeof addLoanSchema>;
// export type RecordLoanPaymentType = z.infer<typeof recordLoanPaymentSchema>;
export type termUnitType = z.infer<typeof TermUnitSchema>;
