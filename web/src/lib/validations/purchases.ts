import { z } from 'zod';
import {
  customerSchema,
  PurchaseStatusSchema,
  PaymentMethodSchema,
} from '@/lib/validations/general';
import { PaymentMethod, PurchaseType } from '@prisma/client';

export const PurchaseTypeSchema = z.enum(PurchaseType);

// Base schemas
export const OtherCostSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().nonnegative('Amount must be non-negative'),
});

// Purchase Item Schema - Now includes fields for different purchase types
export const PurchaseItemSchema = z.object({
  id: z.string().optional(),

  // Common fields
  itemName: z.string().min(1, 'Item name is required'),
  description: z.string().optional(),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  amount: z.number().min(0, 'Amount must be non-negative'),

  // For INVENTORY_RESTOCK
  inventoryItemId: z.string().optional(), // Link to existing inventory
  sku: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().optional().default('unit'),
  reorderLevel: z.number().optional(),
  sellingPrice: z.number().optional(),
  addToInventory: z.boolean().optional().default(false), // Create new inventory item?
  showOnStorefront: z.boolean().optional().default(false),

  // For BUSINESS_EXPENSE
  expenseCategory: z.string().optional(), // e.g., 'OFFICE_SUPPLIES', 'UTILITIES'
  isDeductible: z.boolean().optional().default(true),
  deductionPercentage: z.number().min(0).max(100).optional().default(100),

  // For ASSET_PURCHASE
  assetCategory: z.string().optional(), // e.g., 'VEHICLE', 'EQUIPMENT'
  depreciationRate: z.number().optional(),
  residualValue: z.number().optional(),
  acquisitionDate: z.date().optional(),
});

// Step 1: Vendor and Purchase Details
export const VendorAndPurchaseDetailsSchema = z.object({
  purchaseType: PurchaseTypeSchema, // REQUIRED: Determines backend logic

  customer: customerSchema,
  addAsNewCustomer: z.boolean().optional().default(false),

  title: z.string().min(1, 'Purchase title is required'),
  description: z.string().optional().or(z.literal('')),
  purchaseDate: z.coerce.date().default(() => new Date()),

  sourceQuotationId: z.string().optional(),
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
  paymentMethod: PaymentMethodSchema.default(PaymentMethod.BANK_TRANSFER),
  reference: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),

  // Attachments (receipts, invoices)
  attachments: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        url: z.string().url(),
        type: z.string(),
        size: z.number().optional(),
      })
    )
    .optional()
    .default([]),
});

// Complete schema with validations based on purchase type
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
  // Validate based on purchase type
  .refine(
    data => {
      if (data.purchaseType === 'INVENTORY_RESTOCK') {
        // For inventory, at least one item must have inventory-related fields
        return data.items.some(
          item => item.inventoryItemId || item.addToInventory === true
        );
      }
      return true;
    },
    {
      message:
        'For inventory restock, items must be linked to inventory or marked to be added',
      path: ['items'],
    }
  )
  .refine(
    data => {
      if (data.purchaseType === 'BUSINESS_EXPENSE') {
        // For expenses, items should have expense category
        return data.items.every(item => item.expenseCategory);
      }
      return true;
    },
    {
      message: 'For business expenses, all items must have an expense category',
      path: ['items'],
    }
  )
  .refine(
    data => {
      if (data.purchaseType === 'ASSET_PURCHASE') {
        // For assets, items should have asset category
        return data.items.every(item => item.assetCategory);
      }
      return true;
    },
    {
      message: 'For asset purchases, all items must have an asset category',
      path: ['items'],
    }
  )
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
        return Math.abs(item.amount - expectedTotal) < 0.01;
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
          sum + item.amount,
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
  purchaseType: PurchaseTypeSchema.optional(),
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
  sourceQuotationId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        url: z.string().url(),
        type: z.string(),
        size: z.number().optional(),
      })
    )
    .optional(),
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
  purchaseType: z
    .enum([
      'ALL',
      'INVENTORY_RESTOCK',
      'BUSINESS_EXPENSE',
      'ASSET_PURCHASE',
      'PERSONAL_EXPENSE',
    ])
    .optional(),
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

// Type exports for TypeScript
// export type PurchaseType = z.infer<typeof PurchaseTypeSchema>;
// export type PurchaseItem = z.infer<typeof PurchaseItemSchema>;
// export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>;
// export type UpdatePurchaseInput = z.infer<typeof UpdatePurchaseSchema>;
// export type PurchaseFilters = z.infer<typeof PurchaseFiltersSchema>;
