// Update this in your @/types/purchases.ts file

import { z } from 'zod';
import {
  OtherCostSchema,
  CreatePurchaseSchema,
  VendorAndPurchaseDetailsSchema,
  ItemsAndCostsSchema,
  PaymentInformationSchema,
  PurchaseItemSchema,
} from '@/lib/validations/purchases';
import { PurchaseStatusSchema } from '@/lib/validations/general';
import { DateValue } from '@internationalized/date';
import { PaymentMethod } from '@/types/index';

// Inferred types from schemas
export type VendorAndPurchaseDetailsType = z.infer<
  typeof VendorAndPurchaseDetailsSchema
>;
export type ItemsAndCostsType = z.infer<typeof ItemsAndCostsSchema>;
export type PaymentInformationType = z.infer<typeof PaymentInformationSchema>;
export type PurchaseFormType = z.infer<typeof CreatePurchaseSchema>;
export type AddOtherCostInput = z.infer<typeof OtherCostSchema>;
export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>;
export type PurchaseItemType = z.infer<typeof PurchaseItemSchema> & {
  id: number;
};
export type OtherCostType = AddOtherCostInput;
export type PurchaseStatusType = z.infer<typeof PurchaseStatusSchema>;

export interface DateFilterType {
  start: DateValue;
  end: DateValue;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  userId: string;

  customerId?: string | null;
  vendorName: string;
  vendorEmail?: string | null;
  vendorPhone?: string | null;

  title?: string | null;
  description?: string | null;

  items?: any;
  subtotal: number;

  otherCosts?: any;
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

  createdAt: string;
  updatedAt: string;

  customer?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };

  expense?: {
    id: string;
    category: string;
    amount: number;
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
  dateFilter: DateFilterType | null;
  lastFetchTime: number | null;

  // Actions
  fetchPurchases: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchPurchases: (query: string) => void;
  searchPurchasesInDB: (query: string) => Promise<void>;
  setStatusFilter: (status: PurchaseStatusType | 'ALL') => void;
  setDateFilter: (dateRange: DateFilterType | null) => void;
  applyFilters: () => void;
  getPurchaseByPurchaseNumber: (purchaseNumber: string) => Purchase | undefined;
  updatePurchase: (purchaseId: string, updatedData: Partial<Purchase>) => void;
  deletePurchase: (id: string) => Promise<void>;
  addPurchase: (purchase: Purchase) => void;
  recordPayment: (purchaseId: string, paymentData: any) => Promise<any>;
  clearSearch: () => void;
  refreshPurchases: () => Promise<void>;
  reset: () => void;
}

export interface PurchaseCardProps {
  id: string;
  purchaseNumber: string;
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
