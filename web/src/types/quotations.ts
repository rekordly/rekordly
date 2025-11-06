import { z } from 'zod';
import {
  quotationSchema,
  MaterialItemSchema,
  OtherCostSchema,
  addMaterialItemSchema,
  addOtherCostSchema,
} from '@/lib/validations/quotations';
import { QuotationStatusType } from '@/types/index';

export type MaterialItemType = z.infer<typeof MaterialItemSchema>;
export type AddMaterialItemType = z.infer<typeof addMaterialItemSchema>;
export type OtherCostType = z.infer<typeof OtherCostSchema>;
export type QuotationFormType = z.infer<typeof quotationSchema>;
export type AddOtherCostInput = z.infer<typeof addOtherCostSchema>;

export type CreateQuotationInput = z.infer<typeof quotationSchema>;

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

  materials?: any; // JSON type from Prisma
  materialsTotal: number;
  workmanship: number;

  otherCosts?: any; // JSON type from Prisma
  otherCostsTotal: number;

  includeVAT: boolean;
  vatAmount?: number | null;
  totalAmount: number;

  amountPaid: number;
  balance: number;

  status: QuotationStatusType;
  validUntil?: string | null;
  issueDate: string;

  refundReason?: string | null;
  refundDate?: string | null;
  refundAmount?: number | null;

  createdAt: string;
  updatedAt: string;

  customer?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };

  payments?: {
    id: string;
    quotationId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    reference?: string | null;
    notes?: string | null;
  }[];
}

export interface QuotationStore {
  allQuotations: Quotation[];
  displayedQuotations: Quotation[];
  filteredQuotations: Quotation[];
  isInitialLoading: boolean;
  isPaginating: boolean;
  error: string | null;
  searchQuery: string;
  displayCount: number;
  statusFilter: QuotationStatusType | 'ALL';
  lastFetchTime: number | null;

  // Actions
  fetchQuotations: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchQuotations: (query: string) => void;
  searchQuotationsInDB: (query: string) => Promise<void>; // Fallback DB search
  setStatusFilter: (status: QuotationStatusType | 'ALL') => void;
  applyFilters: () => void;
  getQuotationByNumber: (quotationNumber: string) => Quotation | undefined; // Get single quotation
  updateQuotation: (
    quotationId: string,
    updatedData: Partial<Quotation>
  ) => void; // Update quotation
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
