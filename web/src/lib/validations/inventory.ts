// lib/validations/inventory.ts
import { AdjustmentType, InventoryType } from '@prisma/client';
import { z } from 'zod';

// Inventory Type Enum
export const InventoryTypeSchema = z.enum(InventoryType);

// Stock Adjustment Type Enum
export const AdjustmentTypeSchema = z.enum(AdjustmentType);

// Base Inventory Item Schema
export const InventoryItemSchema = z.object({
  itemType: InventoryTypeSchema,
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.string().optional(),
  sku: z.string().optional(),
  unit: z.string().min(1, 'Unit is required').default('unit'),

  // Inventory tracking
  trackInventory: z.boolean().default(true),

  // Reorder settings
  reorderLevel: z
    .number()
    .min(0, 'Reorder level must be non-negative')
    .optional(),
  reorderQuantity: z
    .number()
    .min(0, 'Reorder quantity must be non-negative')
    .optional(),

  // Cost tracking (read-only for create, can be updated)
  averageCost: z
    .number()
    .min(0, 'Average cost must be non-negative')
    .optional(),
  lastPurchaseCost: z
    .number()
    .min(0, 'Last purchase cost must be non-negative')
    .optional(),

  // Selling price
  sellingPrice: z
    .number()
    .min(0, 'Selling price must be non-negative')
    .optional(),

  // Storefront settings
  showOnStorefront: z.boolean().default(false),

  // Status
  isActive: z.boolean().default(true),
});

// Create Inventory Item Schema
export const CreateInventoryItemSchema = InventoryItemSchema.transform(
  data => ({
    ...data,
    // Initial quantity is always 0 for new items
    quantityOnHand: 0,
    // SKU validation will be done in API route
  })
);

// Update Inventory Item Schema (partial)
export const UpdateInventoryItemSchema = InventoryItemSchema.partial();

// Stock Adjustment Schema
export const StockAdjustmentSchema = z.object({
  adjustmentType: AdjustmentTypeSchema,
  quantity: z
    .number()
    .refine(val => val !== 0, { message: 'Quantity must be non-zero' }),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

// Inventory Filters Schema
export const InventoryFiltersSchema = z.object({
  itemType: InventoryTypeSchema.optional(),
  showOnStorefront: z.boolean().optional(),
  isActive: z.boolean().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  lowStock: z.boolean().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(10000).default(20),
});
