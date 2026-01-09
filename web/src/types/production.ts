// types/production.ts

import { InventoryItem } from './inventory';

// ============================================
// ENUMS
// ============================================

export type ProductionStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';
export type ProductionStatusType = ProductionStatus;

// ============================================
// RECIPE TYPES
// ============================================

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  inventoryItemId: string;
  quantity: number;
  notes?: string;
  inventoryItem?: InventoryItem;
}

export interface RecipeIngredientInput {
  inventoryItemId: string;
  quantity: number;
  notes?: string;
}

export interface ProductRecipe {
  id: string;
  userId: string;
  name: string;
  description?: string;
  category?: string;
  outputInventoryItemId: string;
  outputQuantity: number;
  defaultLaborCost: number;
  defaultOverheadCost: number;
  recipeImage?: string;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;

  // Relations
  outputInventory?: InventoryItem;
  ingredients?: RecipeIngredient[];
  productions?: Production[];
}

export interface RecipeFormInput {
  name: string;
  description?: string;
  category?: string;
  outputInventoryItemId: string;
  outputQuantity: number;
  defaultLaborCost: number;
  defaultOverheadCost: number;
  recipeImage?: string;
  isActive: boolean;
  ingredients: RecipeIngredientInput[];
}

export interface RecipeWithDetails extends ProductRecipe {
  outputInventory: InventoryItem;
  ingredients: (RecipeIngredient & { inventoryItem: InventoryItem })[];
  totalMaterialCost: number;
  totalCostPerBatch: number;
  unitCost: number;
}

// ============================================
// PRODUCTION TYPES
// ============================================

export interface ProductionInput {
  id: string;
  productionId: string;
  inventoryItemId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  notes?: string;
  inventoryItem?: InventoryItem;
}

export interface ProductionInputForm {
  inventoryItemId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  notes?: string;
}

export interface Production {
  id: string;
  userId: string;
  productionNumber: string;
  recipeId?: string;
  saleId?: string;
  title?: string;
  description?: string;
  productionDate: Date | string;
  outputItemName: string;
  outputQuantity: number;
  outputSellingPrice?: number;
  outputInventoryItemId: string;
  outputImage?: string;
  batchMultiplier: number;
  materialsCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  unitCost: number;
  status: ProductionStatus;
  notes?: string;
  createdAt: Date | string;
  updatedAt: Date | string;

  // Relations
  recipe?: ProductRecipe;
  outputInventory?: InventoryItem;
  inputs?: ProductionInput[];
}

export interface ProductionFormInput {
  recipeId?: string; // Optional: null for one-time production
  saleId?: string;
  title?: string;
  description?: string;
  productionDate: Date | string;
  outputItemName: string;
  outputQuantity: number;
  outputSellingPrice?: number;
  outputInventoryItemId: string;
  outputImage?: string;
  batchMultiplier?: number; // Default 1
  laborCost: number;
  overheadCost: number;
  status: ProductionStatus;
  notes?: string;
  inputs: ProductionInputForm[]; // Materials used
}

export interface ProductionWithDetails extends Production {
  recipe?: ProductRecipe;
  outputInventory: InventoryItem;
  inputs: (ProductionInput & { inventoryItem: InventoryItem })[];
}

// ============================================
// PRODUCTION STORE TYPES
// ============================================

export interface ProductionStore {
  // State
  allProductions: Production[];
  displayedProductions: Production[];
  filteredProductions: Production[];
  isLoading: boolean;
  isPaginating: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  error: string | null;
  searchQuery: string;
  displayCount: number;
  statusFilter: ProductionStatusType | 'ALL';
  saleIdFilter: string | null;
  lastFetchTime: number | null;

  // Fetch & Filter
  fetchProductions: (
    forceRefresh?: boolean,
    filters?: {
      status?: ProductionStatusType | 'ALL';
      saleId?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchProductions: (query: string) => void;
  searchProductionsInDB: (query: string) => Promise<void>;
  setStatusFilter: (status: ProductionStatusType | 'ALL') => void;
  setSaleIdFilter: (saleId: string | null) => void;
  applyFilters: () => void;
  resetFilters: () => void;

  // Getters
  getProductionByProductionNumber: (
    productionNumber: string
  ) => Production | undefined;
  getProductionById: (id: string) => Production | undefined;

  // CRUD
  createProduction: (formData: FormData) => Promise<Production>;
  updateProduction: (id: string, formData: FormData) => Promise<Production>;
  deleteProduction: (id: string) => Promise<void>;
  refreshProductions: () => Promise<void>;
  reset: () => void;
}

// ============================================
// RECIPE STORE TYPES
// ============================================

export interface RecipeStore {
  // State
  allRecipes: ProductRecipe[];
  displayedRecipes: ProductRecipe[];
  filteredRecipes: ProductRecipe[];
  isLoading: boolean;
  isPaginating: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  error: string | null;
  searchQuery: string;
  displayCount: number;
  categoryFilter: string | null;
  activeFilter: boolean | 'ALL';
  lastFetchTime: number | null;

  // Fetch & Filter
  fetchRecipes: (forceRefresh?: boolean) => Promise<void>;
  fetchRecipeById: (id: string) => Promise<RecipeWithDetails>;
  loadMoreDisplayed: () => void;
  searchRecipes: (query: string) => void;
  setCategoryFilter: (category: string | null) => void;
  setActiveFilter: (active: boolean | 'ALL') => void;
  applyFilters: () => void;
  resetFilters: () => void;

  // Getters
  getRecipeById: (id: string) => ProductRecipe | undefined;
  getRecipeByOutputItemId: (itemId: string) => ProductRecipe | undefined;

  // CRUD
  createRecipe: (recipe: FormData | RecipeFormInput) => Promise<ProductRecipe>;
  updateRecipe: (
    id: string,
    updates: FormData | Partial<RecipeFormInput>
  ) => Promise<ProductRecipe>;
  deleteRecipe: (id: string) => Promise<void>;
  refreshRecipes: () => Promise<void>;
  reset: () => void;
}

// ============================================
// UI HELPER TYPES
// ============================================

export interface ProductionCostSummary {
  materialsCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  unitCost: number;
  outputQuantity: number;
  profitMargin?: number; // If selling price is known
}

export interface RecipeCostSummary {
  totalMaterialCost: number;
  laborCost: number;
  overheadCost: number;
  totalCostPerBatch: number;
  unitCost: number;
  outputQuantity: number;
}

export interface MaterialAvailability {
  inventoryItemId: string;
  inventoryItem: InventoryItem;
  requiredQuantity: number;
  availableQuantity: number;
  isAvailable: boolean;
  shortfall: number;
}

export interface ProductionValidation {
  canProduce: boolean;
  missingMaterials: MaterialAvailability[];
  warnings: string[];
}
