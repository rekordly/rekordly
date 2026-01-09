import { z } from 'zod';

import {
  QuotationLineItemSchema,
  OtherCostSchema,
  CreateQuotationSchema,
} from '@/lib/validations/quotations';
import { PaymentMethod } from '@prisma/client';
import {
  QuotationStatusSchema,
  addPaymentSchema,
} from '@/lib/validations/general';

// Inferred types from schemas
export type QuotationLineItemType = z.infer<typeof QuotationLineItemSchema>;
export type OtherCostType = z.infer<typeof OtherCostSchema>;
export type AddOtherCostInput = z.infer<typeof OtherCostSchema>;
export type CreateQuotationInput = z.infer<typeof CreateQuotationSchema>;
export type QuotationStatusType = z.infer<typeof QuotationStatusSchema>;
export type AddQuotationPaymentInput = z.infer<typeof addPaymentSchema>;

// NEW: Quotation Line Item Interface (universal for materials, services, products)
export interface QuotationLineItem {
  id: string; // Incremental ID for frontend
  type: 'MATERIAL' | 'SERVICE' | 'PRODUCT' | 'OTHER';
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  inventoryItemId?: string; // Optional link to InventoryItem
}

// Quotation Form Input (for create/edit forms)
export interface QuotationFormInput {
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
  issueDate: Date | string;
  validUntil?: Date | string;

  // NEW: Universal line items array (replaces materials + workmanship)
  lineItems: QuotationLineItem[];

  subtotal: number;
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue?: number;
  discountAmount: number;

  otherCosts: Array<{
    description: string;
    amount: number;
  }>;

  includeVAT: boolean;
  vatAmount?: number;

  totalAmount: number;
  amountPaid: number;
  balance: number;

  status?: QuotationStatusType;
  paymentMethod?: PaymentMethod;
  reference?: string;
  notes?: string;
}

// Updated Quotation Interface
export interface Quotation {
  id: string;
  quotationNumber: string;
  userId: string;
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  title?: string | null;
  description?: string | null;

  // NEW: Universal line items (replaces materials + workmanship)
  lineItems?: QuotationLineItem[];

  subtotal: number;
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
  discountValue?: number | null;
  discountAmount: number;

  otherCosts?: Array<{
    description: string;
    amount: number;
  }>;
  otherCostsTotal: number;

  includeVAT: boolean;
  vatAmount?: number | null;

  totalAmount: number;
  amountPaid: number;
  balance: number;

  status: QuotationStatusType;
  validUntil?: string | Date | null;
  issueDate: string | Date;

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

  payments?: Array<{
    id: string;
    quotationId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    category: 'EXPENSE' | 'INCOME';
    payableType: 'QUOTATION';
    reference?: string | null;
    notes?: string | null;
  }>;

  // NEW: Created purchases relation (from quotation)
  createdPurchases?: Array<{
    id: string;
    purchaseNumber: string;
    totalAmount: number;
    status: string;
  }>;
}

export interface QuotationStore {
  allQuotations: Quotation[];
  displayedQuotations: Quotation[];
  filteredQuotations: Quotation[];

  isInitialLoading: boolean;
  isPaginating: boolean;
  isDeleting: boolean;
  error: string | null;
  searchQuery: string;

  displayCount: number;
  statusFilter: QuotationStatusType | 'ALL';
  lastFetchTime: number | null;

  // Actions
  fetchQuotations: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchQuotations: (query: string) => void;
  searchQuotationsInDB: (query: string) => Promise<void>;
  setStatusFilter: (status: QuotationStatusType | 'ALL') => void;
  applyFilters: () => void;
  getQuotationByNumber: (quotationNumber: string) => Quotation | undefined;
  updateQuotation: (
    quotationId: string,
    updatedData: Partial<Quotation>
  ) => void;
  deleteQuotation: (id: string) => Promise<void>;
  addQuotation: (quotation: Quotation) => void;
  clearSearch: () => void;
  refreshQuotations: () => Promise<void>;
  reset: () => void;
}

export interface QuotationCardProps {
  id: string;
  quotationNumber: string;
  title: string;
  amount: string;
  customerName: string;
  status?: string;
  date: string;
  iconBgColor?: string;
  amountColor?: string;
  onDelete?: () => void;
  onEdit?: (id: string) => void;
}

// NEW: Purchase Pre-fill Type (from quotation materials)
export interface QuotationPurchasePreFill {
  sourceQuotationId: string;
  customer: {
    id?: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    customerRole?: string;
  };
  title?: string;
  description?: string;

  // Items (filtered from lineItems where type === "MATERIAL")
  items: Array<{
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    inventoryItemId?: string | null;
  }>;

  subtotal: number;
  includeVAT: boolean;
  vatAmount?: number;

  totalAmount: number;
  amountPaid: number;
  balance: number;
}
