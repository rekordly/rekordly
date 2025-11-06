import { z } from 'zod';

import { customerSchema, QuotationStatusSchema } from './general';

export const MaterialItemSchema = z.object({
  id: z.number(),
  name: z.string().min(1, 'Name is required'),
  qty: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  total: z.number().positive('Total must be positive'),
});

export const addMaterialItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  qty: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
});

export const addOtherCostSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be positive'),
});

export const OtherCostSchema = z.object({
  id: z.number(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be positive'),
});

export const addQuotationPaymentSchema = z.object({
  amount: z.number().nonnegative('Amount cannot be negative'),
  paymentMethod: z.enum([
    'CASH',
    'BANK_TRANSFER',
    'CARD',
    'MOBILE_MONEY',
    'CHEQUE',
    'OTHER',
  ]),
  reference: z.string().optional(),
  notes: z.string().optional(),
  paymentDate: z.union([z.string(), z.date()]).optional(),
});

export const baseQuotationSchema = z.object({
  customer: customerSchema,
  addAsNewCustomer: z.boolean().optional().default(false),

  quotationTitle: z.string().min(1, 'Please add a quotation title').default(''),
  quotationDescription: z.string().optional().default(''),

  materials: z.array(MaterialItemSchema).optional().default([]),
  materialsTotal: z.number().nonnegative().default(0),

  workmanship: z.number().nonnegative().default(0),

  otherCosts: z.array(OtherCostSchema).optional().default([]),
  otherCostsTotal: z.number().nonnegative().default(0),

  includeVAT: z.boolean().default(false),
  vatAmount: z.number().nonnegative().optional().default(0),
  totalAmount: z.number().positive('Total amount must be positive'),

  balance: z.number().nonnegative().default(0),

  validUntil: z.union([z.string(), z.date()]).optional(),
  issueDate: z.union([z.string(), z.date()]).default(() => new Date()),
  status: QuotationStatusSchema.default('DRAFT'),
});

export const quotationSchema = baseQuotationSchema.transform(data => ({
  ...data,
  issueDate:
    data.issueDate instanceof Date ? data.issueDate : new Date(data.issueDate),
  validUntil: data.validUntil
    ? data.validUntil instanceof Date
      ? data.validUntil
      : new Date(data.validUntil)
    : undefined,
}));
