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

// Inferred types from schemas
export type CustomerAndSaleDetailsType = z.infer<
  typeof CustomerAndSaleDetailsSchema
>;
export type ItemsAndPricingType = z.infer<typeof ItemsAndPricingSchema>;
export type ExpensesAndPaymentType = z.infer<typeof ExpensesAndPaymentSchema>;
export type SaleFormType = z.infer<typeof CreateSaleSchema>;
export type AddOtherCostInput = z.infer<typeof OtherExpensesSchema>;
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;
export type SaleItemType = z.infer<typeof SaleItemSchema> & { id: number };
export type OtherExpensesType = z.infer<typeof OtherExpensesSchema>;
export type SaleStatusType = z.infer<typeof SaleStatusSchema>;
export type OtherCostType = OtherExpensesType; // Alias for consistency

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

  items?: any; // JSON type from Prisma
  itemsTotal: number;

  subtotal: number;
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
  discountValue?: number | null;
  discountAmount: number;

  otherSaleExpenses?: any; // JSON type from Prisma
  otherCostsTotal: number;
  deliveryCost: number;
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

  payments?: {
    id: string;
    saleId: string;
    amount: number;
    paymentDate: string;
    paymentMethod:
      | 'CASH'
      | 'BANK_TRANSFER'
      | 'CARD'
      | 'MOBILE_MONEY'
      | 'CHEQUE'
      | 'OTHER';
    category: 'INCOME';
    payableType: 'SALE';
    reference?: string | null;
    notes?: string | null;
  }[];
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
