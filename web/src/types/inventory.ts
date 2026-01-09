import { z } from 'zod';

import {
  InventoryTypeSchema,
  AdjustmentTypeSchema,
  CreateInventoryItemSchema,
  UpdateInventoryItemSchema,
  InventoryFiltersSchema,
  StockAdjustmentSchema,
} from '@/lib/validations/inventory';

// Inferred types from schemas
export type InventoryType = z.infer<typeof InventoryTypeSchema>;
export type AdjustmentType = z.infer<typeof AdjustmentTypeSchema>;
export type CreateInventoryItemType = z.infer<typeof CreateInventoryItemSchema>;
export type UpdateInventoryItemType = z.infer<typeof UpdateInventoryItemSchema>;
export type InventoryFiltersType = z.infer<typeof InventoryFiltersSchema>;
export type StockAdjustmentType = z.infer<typeof StockAdjustmentSchema>;

export type itemFilterType = z.infer<typeof InventoryTypeSchema>;

// NEW: Inventory Item Interface
export interface InventoryItem {
  id: string;
  userId: string;

  itemType: itemFilterType;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  unit: string;

  trackInventory: boolean;
  quantityOnHand: number;
  reorderLevel: number | null;
  reorderQuantity: number | null;

  averageCost: number;
  lastPurchaseCost: number | null;

  sellingPrice: number | null;

  showOnStorefront: boolean;
  storefrontImage: string | null;
  storefrontOrder: number | null;

  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Relations
  purchaseItems?: {
    id: string;
    purchaseId: string;
    inventoryItemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];

  saleItems?: {
    id: string;
    saleId: string;
    inventoryItemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];

  productionInputs?: {
    id: string;
    productionId: string;
    inventoryItemId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }[];

  stockAdjustments?: {
    id: string;
    inventoryItemId: string;
    adjustmentType: AdjustmentType;
    quantity: number;
    reason: string;
    oldQuantity: number;
    newQuantity: number;
    unitCost: number | null;
    totalCost: number | null;
    notes: string | null;
    adjustmentDate: string;
  }[];
}

// Inventory Item Form Input (for create/edit forms)
export interface InventoryItemInput {
  itemType: InventoryType;
  name: string;
  description?: string;
  category?: string;
  sku?: string;
  unit: string;

  trackInventory?: boolean;
  reorderLevel?: number;
  reorderQuantity?: number;

  averageCost?: number;
  lastPurchaseCost?: number;

  sellingPrice?: number;

  showOnStorefront?: boolean;
  storefrontImage?: string;
  storefrontOrder?: number;

  isActive?: boolean;
}

// Inventory Filters Input (for list page)
export interface InventoryFiltersInput {
  itemType?: InventoryType;
  showOnStorefront?: boolean;
  isActive?: boolean;
  category?: string;
  search?: string;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}

// Stock Adjustment Form Input
export interface StockAdjustmentInput {
  inventoryItemId: string;
  adjustmentType: AdjustmentType;
  quantity: number;
  reason: string;
  notes?: string;
}

// Stock Adjustment Response
export interface StockAdjustment {
  id: string;
  userId: string;
  inventoryItemId: string;

  adjustmentType: AdjustmentType;
  quantity: number;
  reason: string;

  oldQuantity: number;
  newQuantity: number;
  unitCost: number | null;
  totalCost: number | null;

  notes: string | null;
  adjustmentDate: string;

  createdAt: string;
  updatedAt: string;

  // Relations
  inventoryItem?: {
    id: string;
    name: string;
    sku: string | null;
    itemType: string;
    unit: string;
  };
}

// Inventory Store Type (for state management)
export interface InventoryStore {
  // State
  allInventory: InventoryItem[];
  storefrontItems: StorefrontInventoryItem[];
  displayedInventory: InventoryItem[];
  filteredInventory: InventoryItem[];

  isInitialLoading: boolean;
  isPaginating: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  isAdjusting: boolean;

  error: string | null;
  searchQuery: string;

  displayCount: number;
  itemTypeFilter: InventoryType | 'ALL';
  showOnStorefrontFilter: boolean | 'ALL';
  isActiveFilter: boolean | 'ALL';

  lastFetchTime: number | null;

  // Computed/Getter
  isLoading: boolean;

  // Actions
  fetchInventory: (forceRefresh?: boolean) => Promise<void>;
  fetchInventoryItems: (
    filters?: {
      itemType?: InventoryType | 'ALL';
      showOnStorefront?: boolean | 'ALL';
      isActive?: boolean | 'ALL';
      category?: string;
      lowStock?: boolean;
    },
    forceRefresh?: boolean
  ) => Promise<void>;
  fetchStorefrontItems: (filters?: {
    itemType?: InventoryType | 'ALL';
    category?: string;
    search?: string;
    showOnStorefront?: boolean;
    isActive?: boolean;
  }) => Promise<void>;

  loadMoreDisplayed: () => void;
  searchInventory: (query: string) => void;
  searchInventoryInDB: (query: string) => Promise<void>;

  setItemTypeFilter: (type: InventoryType | 'ALL') => void;
  setShowOnStorefrontFilter: (show: boolean | 'ALL') => void;
  setIsActiveFilter: (active: boolean | 'ALL') => void;

  applyFilters: () => void;
  resetFilters: () => void;

  getItemById: (id: string) => InventoryItem | undefined;

  createInventoryItem: (formData: FormData) => Promise<InventoryItem>;
  updateInventoryItem: (
    id: string,
    formData: FormData
  ) => Promise<InventoryItem>;
  deleteInventoryItem: (id: string) => Promise<void>;

  createStockAdjustment: (
    adjustment: StockAdjustmentInput
  ) => Promise<InventoryItem>;
  checkStockAvailability: (itemId: string, quantity: number) => boolean;

  refreshInventory: () => Promise<void>;
  reset: () => void;
}

// Inventory Card Props (for list display)
export interface InventoryCardProps {
  id: string;
  name: string;
  sku: string | null;
  itemType: string;
  category: string | null;
  unit: string;

  quantityOnHand: number;
  reorderLevel: number | null;
  trackInventory: boolean;

  averageCost: number;
  sellingPrice: number | null;

  showOnStorefront: boolean;
  storefrontImage: string | null;
  isActive: boolean;

  // UI helpers
  lowStock?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleActive?: (id: string) => void;
  onCreateAdjustment?: (id: string) => void;
  onViewHistory?: (id: string) => void;
}

// Storefront Inventory Item (for public display)
export interface StorefrontInventoryItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  unit: string;

  itemType: string;
  quantityOnHand: number;
  trackInventory: boolean;
  reorderLevel: number | null;

  averageCost: number;
  sellingPrice: number;

  storefrontImage: string | null;
  storefrontOrder: number;
  showOnStorefront: boolean;
  isActive: boolean;
}
