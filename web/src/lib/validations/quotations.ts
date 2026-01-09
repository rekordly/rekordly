import { z } from 'zod';
import {
  customerSchema,
  PaymentMethodSchema,
  QuotationStatusSchema,
} from './general';
import { PaymentMethod } from '@prisma/client';

// Quotation Line Item Schema
export const QuotationLineItemSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['MATERIAL', 'SERVICE', 'PRODUCT', 'OTHER']),
  name: z.string().min(1, 'Item name is required'),
  description: z.string().optional(),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().min(1, 'Unit is required'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  amount: z.number().min(0, 'Amount must be non-negative'),
  inventoryItemId: z.string().optional(),
});

export const OtherCostSchema = z.object({
  id: z.number().optional(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().nonnegative('Amount must be non-negative'),
});

// Step 1: Customer and Quotation Details
export const quotationDetailsSchema = z.object({
  customer: customerSchema,
  addAsNewCustomer: z.boolean().optional().default(false),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().or(z.literal('')),
  issueDate: z.coerce.date().default(() => new Date()),
  validUntil: z.coerce.date().optional(),
});

// Step 2: Items and Pricing
export const quotationItemsSchema = z.object({
  lineItems: z
    .array(QuotationLineItemSchema)
    .min(1, 'At least one line item is required'),
  subtotal: z.number().nonnegative('Subtotal must be non-negative'),
  includeVAT: z.boolean().default(false),
  vatAmount: z.number().nonnegative().optional().default(0),
});

// Step 3: Expenses and Payment
export const quotationPricingSchema = z.object({
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  discountValue: z.number().nonnegative().optional().default(0),
  discountAmount: z.number().nonnegative().default(0),
  otherCosts: z.array(OtherCostSchema).optional().default([]),
  totalAmount: z.number().nonnegative('Total amount must be non-negative'),
  amountPaid: z.number().nonnegative().default(0),
  balance: z.number().nonnegative().default(0),
  status: QuotationStatusSchema.default('DRAFT'),
  paymentMethod: PaymentMethodSchema.default(PaymentMethod.BANK_TRANSFER),
  reference: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

// Complete Quotation Schema - FIXED
export const CreateQuotationSchema = quotationDetailsSchema
  .merge(quotationItemsSchema)
  .merge(quotationPricingSchema)
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
      // Validate each line item calculation
      return data.lineItems.every(item => {
        const expectedAmount = item.quantity * item.unitPrice;
        return Math.abs(item.amount - expectedAmount) < 0.01;
      });
    },
    {
      message: 'Line item amount must equal quantity multiplied by unit price',
      path: ['lineItems'],
    }
  )
  .refine(
    data => {
      // Validate subtotal matches sum of line items
      const itemsSubtotal = data.lineItems.reduce(
        (sum, item) => sum + item.amount,
        0
      );
      return Math.abs(data.subtotal - itemsSubtotal) < 0.01;
    },
    {
      message: 'Subtotal must equal sum of all line item amounts',
      path: ['subtotal'],
    }
  )
  .refine(
    data => {
      // Validate discount percentage
      if (
        data.discountType === 'PERCENTAGE' &&
        data.discountValue !== undefined
      ) {
        return data.discountValue <= 100;
      }
      return true;
    },
    {
      message: 'Percentage discount cannot exceed 100%',
      path: ['discountValue'],
    }
  )
  .refine(
    data => {
      // Validate discount amount matches discount value
      const subtotalWithVAT = data.subtotal + (data.vatAmount || 0);
      if (
        data.discountType &&
        data.discountValue !== undefined &&
        data.discountAmount !== undefined
      ) {
        if (data.discountType === 'PERCENTAGE') {
          const expectedDiscount = (subtotalWithVAT * data.discountValue) / 100;
          return Math.abs(data.discountAmount - expectedDiscount) < 0.01;
        } else {
          return Math.abs(data.discountAmount - data.discountValue) < 0.01;
        }
      }
      return data.discountAmount <= subtotalWithVAT;
    },
    {
      message: 'Discount amount must match discount value',
      path: ['discountAmount'],
    }
  )
  .refine(
    data => {
      // Validate line item IDs are unique
      const lineItemIds = data.lineItems
        .map(item => item.id)
        .filter((id): id is string => id !== undefined);
      const uniqueIds = new Set(lineItemIds);
      return lineItemIds.length === uniqueIds.size;
    },
    {
      message: 'Line item IDs must be unique',
      path: ['lineItems'],
    }
  )
  .refine(
    data => {
      // Calculate expected total - FIXED THIS VALIDATION
      const subtotalWithVAT = data.subtotal + (data.vatAmount || 0);
      const otherCostsTotal = (data.otherCosts || []).reduce(
        (sum, cost) => sum + cost.amount,
        0
      );
      const expectedTotal =
        subtotalWithVAT - data.discountAmount + otherCostsTotal;
      return Math.abs(data.totalAmount - expectedTotal) < 0.01;
    },
    {
      message:
        'Total amount must equal subtotal plus VAT minus discount plus other costs',
      path: ['totalAmount'],
    }
  )
  .refine(
    data =>
      Math.abs(data.balance - (data.totalAmount - data.amountPaid)) < 0.01,
    {
      message: 'Balance must equal total amount minus amount paid',
      path: ['balance'],
    }
  );

// Update schema
export const UpdateQuotationSchema = z.object({
  customer: customerSchema.optional(),
  addAsNewCustomer: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  issueDate: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  lineItems: z.array(QuotationLineItemSchema).optional(),
  subtotal: z.number().nonnegative().optional(),
  includeVAT: z.boolean().optional(),
  vatAmount: z.number().nonnegative().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  discountValue: z.number().nonnegative().optional(),
  discountAmount: z.number().nonnegative().optional(),
  otherCosts: z.array(OtherCostSchema).optional(),
  totalAmount: z.number().nonnegative().optional(),
  amountPaid: z.number().nonnegative().optional(),
  balance: z.number().nonnegative().optional(),
  status: QuotationStatusSchema.optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
