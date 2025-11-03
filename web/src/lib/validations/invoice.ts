import { z } from 'zod';

export const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional().or(z.literal('')),
});

export const invoiceItemSchema = z.object({
  id: z.number(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  rate: z.number().min(0, 'Rate must be a positive number'),
  amount: z.number().min(0, 'Amount must be a positive number'),
});

export const convertToSalesSchema = z.object({
  amountPaid: z.number().positive('Amount paid must be positive'),
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
  paymentDate: z.union([z.string(), z.date()]),
});

export const invoiceSchema = z.object({
  customer: customerSchema,
  addAsNewCustomer: z.boolean().optional().default(false),
  includeVAT: z.boolean().default(false),
  vatAmount: z.number().default(0),
  invoiceTitle: z.string().min(1, 'Please add an invoice title').default(''),
  invoiceDescription: z.string().optional().default(''),
  dueDate: z.string().optional(), // ISO date string
  items: z
    .array(invoiceItemSchema)
    .min(1, 'Please add at least one invoice item'),
  totalAmount: z.number().min(0).default(0),
  amount: z.number().min(0).default(0),
  status: z.enum(['DRAFT', 'SENT']).default('DRAFT'),
});

export const addItemSchema = z.object({
  itemDescription: z.string().min(1, 'Description is required'),
  itemQuantity: z.number().min(1, 'Quantity must be at least 1'),
  itemRate: z.number().min(0, 'Rate must be a positive number'),
});
