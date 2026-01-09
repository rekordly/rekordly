import { z } from 'zod';
import {
  OtherCostSchema,
  CreatePurchaseSchema,
  VendorAndPurchaseDetailsSchema,
  ItemsAndCostsSchema,
  PaymentInformationSchema,
  PurchaseItemSchema,
  PurchaseTypeSchema,
} from '@/lib/validations/purchases';
import { PurchaseStatusSchema } from '@/lib/validations/general';
import { DateValue } from '@internationalized/date';
import { PaymentMethod, PurchaseType } from '@prisma/client';

// Inferred types from schemas
export type VendorAndPurchaseDetailsType = z.infer<
  typeof VendorAndPurchaseDetailsSchema
>;
export type ItemsAndCostsType = z.infer<typeof ItemsAndCostsSchema>;
export type PaymentInformationType = z.infer<typeof PaymentInformationSchema>;
export type PurchaseFormType = z.infer<typeof CreatePurchaseSchema>;
export type AddOtherCostInput = z.infer<typeof OtherCostSchema>;
export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>;
export type PurchaseItemType = z.infer<typeof PurchaseItemSchema>;
export type OtherCostType = AddOtherCostInput;
export type PurchaseStatusType = z.infer<typeof PurchaseStatusSchema>;
export type PurchaseTypeType = z.infer<typeof PurchaseTypeSchema>;

export interface DateFilterType {
  start: DateValue;
  end: DateValue;
}

// Purchase Item Interface (stored in JSON in Purchase table)
export interface PurchaseItem {
  id?: string;
  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  amount: number;

  // For INVENTORY_RESTOCK
  inventoryItemId?: string;
  sku?: string;
  category?: string;
  unit?: string;
  reorderLevel?: number;
  sellingPrice?: number;
  addToInventory?: boolean;
  showOnStorefront?: boolean;

  // For BUSINESS_EXPENSE
  expenseCategory?: string;
  isDeductible?: boolean;
  deductionPercentage?: number;

  // For ASSET_PURCHASE
  assetCategory?: string;
  depreciationRate?: number;
  residualValue?: number;
  acquisitionDate?: Date | string;

  // Optional: Populated inventory item data (not stored, only for display)
  inventoryItem?: {
    id: string;
    name: string;
    sku: string | null;
    itemType: string;
    unit: string;
    quantityOnHand?: number;
  };
}

// Purchase Form Input Interface (frontend forms)
export interface PurchaseFormInput {
  purchaseType: PurchaseType; // REQUIRED: Determines backend behavior

  customer: {
    id?: string;
    name: string;
    email?: string;
    phone?: string;
    customerRole?: string;
  };
  addAsNewCustomer?: boolean;

  title: string;
  description?: string;
  purchaseDate: Date | string;
  sourceQuotationId?: string;

  items: PurchaseItemInput[];
  subtotal: number;

  otherCosts: Array<{
    id?: string;
    description: string;
    amount: number;
  }>;
  otherCostsTotal: number;

  includeVAT: boolean;
  vatAmount?: number;

  totalAmount: number;
  amountPaid: number;
  balance: number;

  status?: PurchaseStatusType;
  paymentMethod?: PaymentMethod;
  reference?: string;
  notes?: string;

  attachments?: Array<{
    id?: string;
    name: string;
    url: string;
    type: string;
    size?: number;
  }>;
}

// Purchase Item Input Interface (for frontend forms)
export interface PurchaseItemInput {
  id?: string; // Temporary ID for form
  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  amount: number;

  // For INVENTORY_RESTOCK
  inventoryItemId?: string;
  sku?: string;
  category?: string;
  unit?: string;
  reorderLevel?: number;
  sellingPrice?: number;
  addToInventory?: boolean;
  showOnStorefront?: boolean;

  // For BUSINESS_EXPENSE
  expenseCategory?: string;
  isDeductible?: boolean;
  deductionPercentage?: number;

  // For ASSET_PURCHASE
  assetCategory?: string;
  depreciationRate?: number;
  residualValue?: number;
  acquisitionDate?: Date | string;
}

// Main Purchase Interface (matches Prisma schema)
export interface Purchase {
  id: string;
  purchaseNumber: string;
  userId: string;

  purchaseType: PurchaseType; // NEW: Purchase type

  customerId?: string | null;
  vendorName: string;
  vendorEmail?: string | null;
  vendorPhone?: string | null;

  title?: string | null;
  description?: string | null;

  // Items stored as JSON (not a relation)
  items: PurchaseItem[]; // JSON field

  sourceQuotationId?: string | null;
  sourceQuotation?: {
    id: string;
    quotationNumber: string;
  };

  subtotal: number;

  otherCosts?: any; // JSON
  otherCostsTotal: number;

  includeVAT: boolean;
  vatAmount?: number | null;

  totalAmount: number;

  amountPaid: number;
  balance: number;

  status: PurchaseStatusType;
  purchaseDate: string | Date;

  refundReason?: string | null;
  refundDate?: string | Date | null;
  refundAmount?: number | null;

  attachments?: any; // JSON

  createdAt: string;
  updatedAt: string;

  // Relations
  customer?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };

  payments?: {
    id: string;
    purchaseId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    category: 'EXPENSE' | 'INCOME';
    payableType: 'PURCHASE';
    reference?: string | null;
    notes?: string | null;
  }[];
}

// Additional Records returned from handlers
export interface InventoryRestockRecords {
  type: 'INVENTORY_RESTOCK';
  inventoryUpdates: any[];
  newInventoryItems: any[];
  stockAdjustments: any[];
}

export interface BusinessExpenseRecords {
  type: 'BUSINESS_EXPENSE';
  expenses: any[];
}

export interface AssetPurchaseRecords {
  type: 'ASSET_PURCHASE';
  assets: any[];
}

export interface PersonalExpenseRecords {
  type: 'PERSONAL_EXPENSE';
  ownerEquity: any;
  totalAmount: number;
}

export type PurchaseAdditionalRecords =
  | InventoryRestockRecords
  | BusinessExpenseRecords
  | AssetPurchaseRecords
  | PersonalExpenseRecords;

// Store Interface
export interface PurchaseStore {
  allPurchases: Purchase[];
  displayedPurchases: Purchase[];
  filteredPurchases: Purchase[];
  isInitialLoading: boolean;
  isPaginating: boolean;
  isDeleting: boolean;
  error: string | null;
  searchQuery: string;
  displayCount: number;
  statusFilter: PurchaseStatusType | 'ALL';
  purchaseTypeFilter: PurchaseType | 'ALL'; // NEW: Filter by purchase type
  dateFilter: DateFilterType | null;
  lastFetchTime: number | null;

  // Actions
  fetchPurchases: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchPurchases: (query: string) => void;
  searchPurchasesInDB: (query: string) => Promise<void>;
  setStatusFilter: (status: PurchaseStatusType | 'ALL') => void;
  setPurchaseTypeFilter: (type: PurchaseType | 'ALL') => void; // NEW
  setDateFilter: (dateRange: DateFilterType | null) => void;
  applyFilters: () => void;
  getPurchaseByPurchaseNumber: (purchaseNumber: string) => Purchase | undefined;
  updatePurchase: (purchaseId: string, updatedData: Partial<Purchase>) => void;
  deletePurchase: (id: string) => Promise<void>;
  addPurchase: (purchase: Purchase) => void;
  clearSearch: () => void;
  refreshPurchases: () => Promise<void>;
  reset: () => void;
}

// Card Props
export interface PurchaseCardProps {
  id: string;
  purchaseNumber: string;
  purchaseType: PurchaseType; // NEW
  title: string;
  amount: string;
  vendorName: string;
  status?: string;
  date: string;
  iconBgColor?: string;
  amountColor?: string;
  onDelete?: () => void;
  onEdit?: (id: string) => void;
}
