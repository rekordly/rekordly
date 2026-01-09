import { z } from 'zod';

import {
  OtherExpensesSchema,
  CreateSaleSchema,
  CustomerAndSaleDetailsSchema,
  ItemsAndPricingSchema,
  ExpensesAndPaymentSchema,
  SaleItemSchema,
} from '@/lib/validations/sales';
import { SaleStatusSchema } from '@/lib/validations/general';
import { PaymentMethod } from '@/types/index';

// Inferred types from schemas
export type CustomerAndSaleDetailsType = z.infer<
  typeof CustomerAndSaleDetailsSchema
>;
export type ItemsAndPricingType = z.infer<typeof ItemsAndPricingSchema>;
export type ExpensesAndPaymentType = z.infer<typeof ExpensesAndPaymentSchema>;
export type SaleFormType = z.infer<typeof CreateSaleSchema>;
export type AddOtherCostInput = z.infer<typeof OtherExpensesSchema>;
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;
export type SaleItemType = z.infer<typeof SaleItemSchema> & { id: string };
export type OtherExpensesType = z.infer<typeof OtherExpensesSchema>;
export type SaleStatusType = z.infer<typeof SaleStatusSchema>;
export type OtherCostType = OtherExpensesType; // Alias for consistency

// NEW: SaleItem Interface (for saleItems relation)
export interface SaleItem {
  id: string;
  saleId: string;
  inventoryItemId?: string;
  productionId?: string;

  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  amount: number;

  costPrice: number;
  totalCost: number;
  profit: number;

  // Populated relations (from API include)
  inventoryItem?: {
    id: string;
    name: string;
    sku: string | null;
    itemType: string;
  };

  production?: {
    id: string;
    productionNumber: string;
  };
}

// Updated SaleFormType for frontend forms
export interface SaleFormInput {
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
  saleDate: Date | string;

  // Updated: Use SaleItemInput[] structure
  items: SaleItemInput[];
  subtotal: number;

  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue?: number;
  discountAmount: number;

  deliveryCost: number;
  otherSaleExpenses: Array<{
    description: string;
    amount: number;
  }>;
  totalSaleExpenses: number;

  includeVAT: boolean;
  vatAmount?: number;

  totalAmount: number;
  amountPaid: number;
  balance: number;
  status?: SaleStatusType;
  paymentMethod?: PaymentMethod;
}

// NEW: SaleItemInput Interface (for frontend forms)
export interface SaleItemInput {
  id: number; // Temporary ID for form
  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  amount: number;

  inventoryItemId?: string;
  productionId?: string;

  // Optional: cost and profit for display
  costPrice?: number;
  profit?: number;
}

// Updated Sale Interface
export interface Sale {
  id: string;
  receiptNumber: string;
  userId: string;
  sourceType: 'DIRECT' | 'FROM_INVOICE';
  invoiceId?: string | null;

  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;

  title?: string | null;
  description?: string | null;

  // REMOVED: items (JSON)
  // ADDED: saleItems (relation)
  saleItems?: SaleItem[];

  subtotal: number;

  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
  discountValue?: number | null;
  discountAmount: number;

  deliveryCost: number;
  otherSaleExpenses?: any; // JSON type from Prisma
  totalSaleExpenses: number;

  includeVAT: boolean;
  vatAmount?: number | null;

  totalAmount: number;
  amountPaid: number;
  balance: number;

  status: SaleStatusType;
  saleDate: string | Date;

  refundReason?: string | null;
  refundDate?: string | Date | null;
  refundAmount?: number | null;

  createdAt: string;
  updatedAt: string;

  // Relations
  customer?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };

  invoice?: {
    id: string;
    invoiceNumber: string;
  };

  payments?: Array<{
    id: string;
    saleId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    category: 'EXPENSE' | 'INCOME';
    payableType: 'SALE';
    reference?: string | null;
    notes?: string | null;
  }>;
}

export interface SaleStore {
  allSales: Sale[];
  displayedSales: Sale[];
  filteredSales: Sale[];
  isInitialLoading: boolean;
  isPaginating: boolean;
  isDeleting: boolean;
  error: string | null;
  searchQuery: string;
  displayCount: number;
  statusFilter: SaleStatusType | 'ALL';
  lastFetchTime: number | null;

  // Actions
  fetchSales: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchSales: (query: string) => void;
  searchSalesInDB: (query: string) => Promise<void>;
  setStatusFilter: (status: SaleStatusType | 'ALL') => void;
  applyFilters: () => void;
  getSaleByReceiptNumber: (receiptNumber: string) => Sale | undefined;
  updateSale: (saleId: string, updatedData: Partial<Sale>) => void;
  deleteSale: (id: string) => Promise<void>;
  addSale: (sale: Sale) => void;
  clearSearch: () => void;
  refreshSales: () => Promise<void>;
  reset: () => void;
}

export interface SaleCardProps {
  id: string;
  receiptNumber: string;
  title: string;
  amount: string;
  customerName: string;
  status?: string;
  date: string;
  sourceType?: 'DIRECT' | 'FROM_INVOICE';
  iconBgColor?: string;
  amountColor?: string;
  onDelete?: () => void;
  onEdit?: (id: string) => void;
}
