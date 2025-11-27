import { z } from 'zod';
import {
  customerSchema,
  PaymentMethodSchema,
  PurchaseStatusSchema,
} from '@/lib/validations/general';

// Base schemas
export const OtherCostSchema = z.object({
  id: z.number(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().nonnegative('Amount must be non-negative'),
});

export const PurchaseItemSchema = z.object({
  id: z.number().optional(),
  description: z.string().min(1, 'Item description is required'),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  total: z.number().min(0, 'Total must be a positive number'),
});

// Step 1: Customer and Purchase Details
export const VendorAndPurchaseDetailsSchema = z.object({
  customer: customerSchema,
  addAsNewCustomer: z.boolean().default(false),
  title: z.string().min(1, 'Purchase title is required'),
  description: z.string().optional().or(z.literal('')),
  purchaseDate: z.coerce.date().default(() => new Date()),
});

// Step 2: Items and Costs
export const ItemsAndCostsSchema = z.object({
  items: z.array(PurchaseItemSchema).min(1, 'At least one item is required'),
  subtotal: z.number().nonnegative('Subtotal must be non-negative'),
  otherCosts: z.array(OtherCostSchema).optional().default([]),
  otherCostsTotal: z.number().nonnegative().default(0),
  includeVAT: z.boolean().default(false),
  vatAmount: z.number().nonnegative().optional().default(0),
});

// Step 3: Payment Information
export const PaymentInformationSchema = z.object({
  totalAmount: z.number().nonnegative('Total amount must be non-negative'),
  amountPaid: z.number().nonnegative().default(0),
  balance: z.number().nonnegative().default(0),
  status: PurchaseStatusSchema.default('UNPAID'),
  paymentMethod: PaymentMethodSchema.default('BANK_TRANSFER'),
  reference: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

// Complete schema with transformations and validations
export const CreatePurchaseSchema = VendorAndPurchaseDetailsSchema.merge(
  ItemsAndCostsSchema
)
  .merge(PaymentInformationSchema)
  .transform(data => ({
    ...data,
    purchaseDate:
      data.purchaseDate instanceof Date
        ? data.purchaseDate
        : new Date(data.purchaseDate),
  }))
  .refine(
    data => {
      // Amount paid cannot exceed total amount
      return data.amountPaid <= data.totalAmount;
    },
    {
      message: 'Amount paid cannot be greater than total amount',
      path: ['amountPaid'],
    }
  )
  .refine(
    data => {
      if (data.otherCosts && data.otherCosts.length > 0) {
        const otherCostsSum = data.otherCosts.reduce(
          (sum: number, cost: z.infer<typeof OtherCostSchema>) =>
            sum + cost.amount,
          0
        );
        return Math.abs(data.otherCostsTotal - otherCostsSum) < 0.01;
      }
      return data.otherCostsTotal === 0;
    },
    {
      message: 'Other costs total must equal sum of all other costs',
      path: ['otherCostsTotal'],
    }
  )
  .refine(
    data => {
      // Calculate expected total: subtotal + other costs + VAT
      const expectedTotal =
        data.subtotal + data.otherCostsTotal + (data.vatAmount || 0);
      return Math.abs(data.totalAmount - expectedTotal) < 0.01;
    },
    {
      message: 'Total amount must equal subtotal plus other costs plus VAT',
      path: ['totalAmount'],
    }
  )
  .refine(
    data => {
      // Calculate expected balance
      const expectedBalance = data.totalAmount - data.amountPaid;
      return Math.abs(data.balance - expectedBalance) < 0.01;
    },
    {
      message: 'Balance must equal total amount minus amount paid',
      path: ['balance'],
    }
  )
  .refine(
    data => {
      // Validate item calculations
      return data.items.every(item => {
        const expectedTotal = item.quantity * item.unitPrice;
        return Math.abs(item.total - expectedTotal) < 0.01;
      });
    },
    {
      message: 'Item total must equal quantity multiplied by unit price',
      path: ['items'],
    }
  )
  .refine(
    data => {
      // Validate subtotal matches sum of item totals
      const itemsSubtotal = data.items.reduce(
        (sum: number, item: z.infer<typeof PurchaseItemSchema>) =>
          sum + item.total,
        0
      );
      return Math.abs(data.subtotal - itemsSubtotal) < 0.01;
    },
    {
      message: 'Subtotal must equal sum of all item totals',
      path: ['subtotal'],
    }
  );

// Update schema (partial)
export const UpdatePurchaseSchema = z.object({
  customer: customerSchema.optional(),
  addAsNewCustomer: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  purchaseDate: z.coerce.date().optional(),
  items: z.array(PurchaseItemSchema).optional(),
  subtotal: z.number().nonnegative().optional(),
  otherCosts: z.array(OtherCostSchema).optional(),
  otherCostsTotal: z.number().nonnegative().optional(),
  includeVAT: z.boolean().optional(),
  vatAmount: z.number().nonnegative().optional(),
  totalAmount: z.number().nonnegative().optional(),
  amountPaid: z.number().nonnegative().optional(),
  balance: z.number().nonnegative().optional(),
  status: PurchaseStatusSchema.optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

// Payment recording schema
export const RecordPaymentSchema = z.object({
  amount: z.number().positive('Payment amount must be positive'),
  paymentMethod: PaymentMethodSchema,
  reference: z.string().optional(),
  notes: z.string().optional(),
});

// Search filters schema
export const PurchaseFiltersSchema = z.object({
  query: z.string().optional(),
  status: z
    .enum([
      'ALL',
      'UNPAID',
      'PARTIALLY_PAID',
      'PAID',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ])
    .optional(),
  dateRange: z
    .object({
      start: z.date().optional(),
      end: z.date().optional(),
    })
    .optional(),
});
