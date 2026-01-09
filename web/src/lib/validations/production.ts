// lib/validations/production.ts

import { z } from 'zod';

// ============================================
// RECIPE VALIDATIONS
// ============================================

export const RecipeIngredientSchema = z.object({
  inventoryItemId: z.string().min(1, 'Material is required'),
  quantity: z
    .number()
    .positive('Quantity must be greater than 0')
    .finite('Quantity must be a valid number'),
  notes: z.string().optional(),
});

export const CreateRecipeSchema = z.object({
  name: z
    .string()
    .min(1, 'Recipe name is required')
    .max(200, 'Recipe name is too long'),
  description: z.string().max(1000, 'Description is too long').optional(),
  category: z.string().max(100).optional(),

  outputInventoryItemId: z.string().min(1, 'Output product is required'),
  outputQuantity: z
    .number()
    .positive('Output quantity must be greater than 0')
    .finite('Output quantity must be a valid number'),

  defaultLaborCost: z
    .number()
    .min(0, 'Labor cost cannot be negative')
    .finite('Labor cost must be a valid number')
    .default(0),
  defaultOverheadCost: z
    .number()
    .min(0, 'Overhead cost cannot be negative')
    .finite('Overhead cost must be a valid number')
    .default(0),

  recipeImage: z
    .string()
    .url('Recipe image must be a valid URL')
    .optional()
    .or(z.literal('')),

  isActive: z.boolean().default(true),

  ingredients: z
    .array(RecipeIngredientSchema)
    .min(1, 'At least one ingredient is required')
    .refine(
      ingredients => {
        const ids = ingredients.map(i => i.inventoryItemId);
        return new Set(ids).size === ids.length;
      },
      { message: 'Cannot use the same material multiple times' }
    ),
});

export const UpdateRecipeSchema = CreateRecipeSchema.partial().extend({
  ingredients: z
    .array(RecipeIngredientSchema)
    .min(1, 'At least one ingredient is required')
    .optional()
    .refine(
      ingredients => {
        if (!ingredients || ingredients.length === 0) return true;
        const ids = ingredients.map(i => i.inventoryItemId);
        return new Set(ids).size === ids.length;
      },
      { message: 'Cannot use the same material multiple times' }
    ),
});

// ============================================
// PRODUCTION VALIDATIONS
// ============================================

export const ProductionInputSchema = z.object({
  inventoryItemId: z.string().min(1, 'Material is required'),
  quantity: z
    .number()
    .positive('Quantity must be greater than 0')
    .finite('Quantity must be a valid number'),
  unitCost: z
    .number()
    .min(0, 'Unit cost cannot be negative')
    .finite('Unit cost must be a valid number'),
  totalCost: z
    .number()
    .min(0, 'Total cost cannot be negative')
    .finite('Total cost must be a valid number'),
  notes: z.string().max(500).optional(),
});

export const ProductionStatusSchema = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

export const CreateProductionSchema = z.object({
  // Optional recipe link
  recipeId: z.string().optional(),

  // Optional sale link
  saleId: z.string().optional(),

  title: z.string().max(200, 'Title is too long').optional(),
  description: z.string().max(1000, 'Description is too long').optional(),

  productionDate: z.coerce.date().default(() => new Date()),

  // Output details
  outputItemName: z
    .string()
    .min(1, 'Product name is required')
    .max(200, 'Product name is too long'),
  outputQuantity: z
    .number()
    .positive('Output quantity must be greater than 0')
    .finite('Output quantity must be a valid number'),
  outputSellingPrice: z
    .number()
    .min(0, 'Selling price cannot be negative')
    .finite('Selling price must be a valid number')
    .optional(),
  outputInventoryItemId: z.string().min(1, 'Output product is required'),
  outputImage: z
    .string()
    .url('Output image must be a valid URL')
    .optional()
    .or(z.literal('')),

  // Batch multiplier (for recipe-based)
  batchMultiplier: z
    .number()
    .positive('Batch multiplier must be greater than 0')
    .finite('Batch multiplier must be a valid number')
    .default(1),

  // Costs
  laborCost: z
    .number()
    .min(0, 'Labor cost cannot be negative')
    .finite('Labor cost must be a valid number')
    .default(0),
  overheadCost: z
    .number()
    .min(0, 'Overhead cost cannot be negative')
    .finite('Overhead cost must be a valid number')
    .default(0),

  status: ProductionStatusSchema.default('COMPLETED'),
  notes: z.string().max(2000, 'Notes are too long').optional(),

  // Materials used
  inputs: z
    .array(ProductionInputSchema)
    .min(1, 'At least one material is required')
    .refine(
      inputs => {
        const ids = inputs.map(i => i.inventoryItemId);
        return new Set(ids).size === ids.length;
      },
      { message: 'Cannot use the same material multiple times' }
    ),
});

export const UpdateProductionSchema = z.object({
  title: z.string().max(200, 'Title is too long').optional(),
  description: z.string().max(1000, 'Description is too long').optional(),
  productionDate: z.coerce.date().optional(),

  outputItemName: z.string().min(1).max(200).optional(),
  outputQuantity: z.number().positive().finite().optional(),
  outputSellingPrice: z.number().min(0).finite().optional(),
  outputImage: z.string().url().optional().or(z.literal('')),

  laborCost: z.number().min(0).finite().optional(),
  overheadCost: z.number().min(0).finite().optional(),

  status: ProductionStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
});

// ============================================
// PRODUCTION FILTERS
// ============================================

export const ProductionFiltersSchema = z.object({
  status: ProductionStatusSchema.or(z.literal('ALL')).optional(),
  saleId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  recipeId: z.string().optional(),
  outputInventoryItemId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(10000).default(50),
});

// ============================================
// RECIPE FILTERS
// ============================================

export const RecipeFiltersSchema = z.object({
  category: z.string().optional(),
  isActive: z.boolean().optional(),
  outputInventoryItemId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(10000).default(50),
});

// ============================================
// BATCH CALCULATION SCHEMA
// ============================================

export const BatchCalculationSchema = z.object({
  recipeId: z.string().min(1, 'Recipe is required'),
  batchMultiplier: z
    .number()
    .positive('Batch multiplier must be greater than 0')
    .finite('Batch multiplier must be a valid number')
    .default(1),
  adjustments: z
    .array(
      z.object({
        ingredientId: z.string(),
        newQuantity: z.number().positive().finite(),
      })
    )
    .optional(),
});

// ============================================
// MATERIAL AVAILABILITY CHECK
// ============================================

export const MaterialAvailabilitySchema = z.object({
  materials: z.array(
    z.object({
      inventoryItemId: z.string(),
      requiredQuantity: z.number().positive(),
    })
  ),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type RecipeIngredientInput = z.infer<typeof RecipeIngredientSchema>;
export type CreateRecipeInput = z.infer<typeof CreateRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof UpdateRecipeSchema>;

export type ProductionInputInput = z.infer<typeof ProductionInputSchema>;
export type CreateProductionInput = z.infer<typeof CreateProductionSchema>;
export type UpdateProductionInput = z.infer<typeof UpdateProductionSchema>;
export type ProductionStatus = z.infer<typeof ProductionStatusSchema>;

export type ProductionFilters = z.infer<typeof ProductionFiltersSchema>;
export type RecipeFilters = z.infer<typeof RecipeFiltersSchema>;
export type BatchCalculation = z.infer<typeof BatchCalculationSchema>;
export type MaterialAvailabilityCheck = z.infer<
  typeof MaterialAvailabilitySchema
>;
