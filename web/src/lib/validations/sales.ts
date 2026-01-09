import { z } from 'zod';
import {
  customerSchema,
  SaleStatusSchema,
  PaymentMethodSchema,
} from '@/lib/validations/general';
import { PaymentMethod } from '@prisma/client';

export const SaleSourceTypeSchema = z.enum(['DIRECT', 'FROM_INVOICE']);
export const DiscountTypeSchema = z.enum(['PERCENTAGE', 'FIXED_AMOUNT']);

export const OtherExpensesSchema = z.object({
  id: z.number().optional(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().nonnegative('Amount must be non-negative'),
});

export const SaleItemSchema = z
  .object({
    id: z.string().optional(),
    itemName: z.string().min(1, 'Item name is required'),
    description: z.string().nullable().optional().default(''),
    quantity: z.number().positive('Quantity must be positive'),
    unitPrice: z.number().nonnegative('Unit price must be non-negative'),
    amount: z.number().min(0, 'Amount must be a positive number'),
    inventoryItemId: z
      .string()
      .nullable()
      .optional()
      .transform(val => val || undefined),
    productionId: z
      .string()
      .nullable()
      .optional()
      .transform(val => val || undefined),
    costPrice: z.number().nonnegative().optional().default(0),
    profit: z.number().optional().default(0),
  })
  .refine(
    data => {
      // Either itemName or inventoryItemId must be provided
      if (!data.inventoryItemId) {
        return !!data.itemName && data.itemName.trim() !== '';
      }
      return true;
    },
    {
      message: 'Item name is required when not linked to inventory',
      path: ['itemName'],
    }
  )
  .refine(
    data => {
      // Validate amount calculation (quantity × unitPrice)
      const expectedAmount = data.quantity * data.unitPrice;
      return Math.abs(data.amount - expectedAmount) < 0.01; // Allow for rounding
    },
    {
      message: 'Item amount must equal quantity multiplied by unit price',
      path: ['amount'],
    }
  );

// Step 1: Customer and Sale Details
export const CustomerAndSaleDetailsSchema = z.object({
  sourceType: SaleSourceTypeSchema.default('DIRECT'),
  invoiceId: z.string().nullable().optional().or(z.literal('')),
  customer: customerSchema,
  addAsNewCustomer: z.boolean().optional().default(false),
  title: z.string().min(1, 'Sale title is required'),
  description: z.string().nullable().optional().or(z.literal('')),
  saleDate: z.coerce.date().default(() => new Date()),
});

// Step 2: Items and Pricing
export const ItemsAndPricingSchema = z.object({
  items: z.array(SaleItemSchema).min(1, 'At least one item is required'),
  subtotal: z.number().nonnegative('Subtotal must be non-negative'),
  includeVAT: z.boolean().default(false),
  vatAmount: z.number().nonnegative().nullable().optional().default(0),
});

// Step 3: Expenses and Payment
export const ExpensesAndPaymentSchema = z.object({
  discountType: DiscountTypeSchema.nullable().optional(),
  discountValue: z.number().nonnegative().nullable().optional().default(0),
  discountAmount: z.number().nonnegative().default(0),
  deliveryCost: z.number().nonnegative().default(0),
  otherSaleExpenses: z.array(OtherExpensesSchema).optional().default([]),
  totalSaleExpenses: z.number().nonnegative().default(0),
  totalAmount: z.number().nonnegative('Total amount must be non-negative'),
  amountPaid: z.number().nonnegative().default(0),
  balance: z.number().nonnegative().default(0),
  status: SaleStatusSchema.default('UNPAID'),
  paymentMethod: PaymentMethodSchema.default(PaymentMethod.BANK_TRANSFER),
});

// Base schema without transformations (for partial updates)
export const BaseSaleSchema = CustomerAndSaleDetailsSchema.merge(
  ItemsAndPricingSchema
).merge(ExpensesAndPaymentSchema);

// Complete schema with transformations and validations
export const CreateSaleSchema = BaseSaleSchema.transform(data => ({
  ...data,
  saleDate:
    data.saleDate instanceof Date ? data.saleDate : new Date(data.saleDate),
  // Normalize nullable fields to undefined/default values
  description: data.description || undefined,
  invoiceId: data.invoiceId || undefined,
  discountType: data.discountType || undefined,
  discountValue: data.discountValue || 0,
  vatAmount: data.vatAmount || 0,
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
      // Discount amount cannot exceed total amount (subtotal + VAT)
      const subtotalWithVAT = data.subtotal + (data.vatAmount || 0);
      return data.discountAmount <= subtotalWithVAT;
    },
    {
      message: 'Discount amount cannot be greater than subtotal',
      path: ['discountAmount'],
    }
  )
  .refine(
    data => {
      if (
        data.discountType &&
        data.discountValue !== undefined &&
        data.discountValue !== null
      ) {
        if (data.discountType === 'PERCENTAGE') {
          return data.discountValue <= 100;
        }
        return true;
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
      if (
        data.discountType &&
        data.discountValue !== undefined &&
        data.discountValue !== null &&
        data.discountAmount !== undefined
      ) {
        const subtotalWithVAT = data.subtotal + (data.vatAmount || 0);
        if (data.discountType === 'PERCENTAGE') {
          const expectedDiscount = (subtotalWithVAT * data.discountValue) / 100;
          return Math.abs(data.discountAmount - expectedDiscount) < 0.01;
        } else {
          return Math.abs(data.discountAmount - data.discountValue) < 0.01;
        }
      }
      return true;
    },
    {
      message: 'Discount amount must match discount value',
      path: ['discountAmount'],
    }
  )
  .refine(
    data => {
      if (data.otherSaleExpenses && data.otherSaleExpenses.length > 0) {
        const otherExpensesSum = data.otherSaleExpenses.reduce(
          (sum: number, expense: z.infer<typeof OtherExpensesSchema>) =>
            sum + expense.amount,
          0
        );
        return (
          Math.abs(
            data.totalSaleExpenses - (data.deliveryCost + otherExpensesSum)
          ) < 0.01
        );
      }
      return Math.abs(data.totalSaleExpenses - data.deliveryCost) < 0.01;
    },
    {
      message:
        'Total sale expenses must equal delivery cost plus other expenses',
      path: ['totalSaleExpenses'],
    }
  )
  .refine(
    data =>
      Math.abs(data.balance - (data.totalAmount - data.amountPaid)) < 0.01,
    {
      message: 'Balance must equal total amount minus amount paid',
      path: ['balance'],
    }
  )
  .refine(
    data => {
      // Validate each sale item
      return data.items.every((item, index) => {
        if (item.inventoryItemId) {
          // If inventoryItemId is provided, itemName is optional
          return true;
        }
        // If no inventoryItemId, itemName is required
        if (!item.itemName || item.itemName.trim() === '') {
          return false;
        }
        return true;
      });
    },
    {
      message: 'Item name is required for items not linked to inventory',
      path: ['items'],
    }
  );
