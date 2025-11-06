import { z } from 'zod';

import { customerSchema } from './general';

import { InvoiceStatusSchema } from '@/lib/validations/general';

export const invoiceItemSchema = z.object({
  id: z.number(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  rate: z.number().min(0, 'Rate must be a positive number'),
  amount: z.number().min(0, 'Amount must be a positive number'),
});

export const baseInvoiceSchema = z.object({
  customer: customerSchema,
  addAsNewCustomer: z.boolean().optional().default(false),
  includeVAT: z.boolean().default(false),
  vatAmount: z.number().default(0),
  invoiceTitle: z.string().min(1, 'Please add an invoice title').default(''),
  invoiceDescription: z.string().optional().default(''),
  dueDate: z.union([z.string(), z.date()]).optional(),
  items: z
    .array(invoiceItemSchema)
    .min(1, 'Please add at least one invoice item'),
  totalAmount: z.number().min(0).default(0),
  amount: z.number().min(0).default(0),
  status: InvoiceStatusSchema.default('DRAFT').optional(),
});

export const invoiceSchema = baseInvoiceSchema.transform(data => ({
  ...data,
  dueDate: data.dueDate
    ? data.dueDate instanceof Date
      ? data.dueDate
      : new Date(data.dueDate)
    : undefined,
}));

export const addItemSchema = z.object({
  itemDescription: z.string().min(1, 'Description is required'),
  itemQuantity: z.number().min(1, 'Quantity must be at least 1'),
  itemRate: z.number().min(0, 'Rate must be a positive number'),
});
