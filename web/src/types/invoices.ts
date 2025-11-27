import { z } from 'zod';

import {
  invoiceItemSchema,
  invoiceSchema,
  addItemSchema,
} from '@/lib/validations/invoices';
import { PaymentMethod } from '@/types/index';

export type InvoiceItemType = z.infer<typeof invoiceItemSchema>;
export type InvoiceFormType = z.infer<typeof invoiceSchema>;
export type AddItemFormType = z.infer<typeof addItemSchema>;

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'CONVERTED';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  title?: string | null;
  description?: string | null;
  includeVAT: boolean;
  items: any; // JSON type from Prisma
  amount: number;
  vatAmount?: number | null;
  totalAmount: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  sale?: {
    id: string;
    receiptNumber: string;
    amountPaid: number;
    balance: number;
    status: string;
    payments: {
      id: string;
      saleId: string;
      amount: number;
      paymentDate: string;
      paymentMethod: PaymentMethod;
      category: 'EXPENSE' | 'INCOME';
      payableType: 'SALE';
      reference?: string | null;
      notes?: string | null;
    }[];
  };
}

// Add this to your existing invoice types file

export interface InvoiceStore {
  allInvoices: Invoice[];
  displayedInvoices: Invoice[];
  filteredInvoices: Invoice[];
  isInitialLoading: boolean;
  isPaginating: boolean;
  error: string | null;
  searchQuery: string;
  displayCount: number;
  statusFilter: InvoiceStatus | 'ALL';
  lastFetchTime: number | null;

  fetchInvoices: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchInvoices: (query: string) => void;
  setStatusFilter: (status: InvoiceStatus | 'ALL') => void;
  applyFilters: () => void;
  searchInvoicesInDB: (query: string) => Promise<void>;
  getInvoiceByNumber: (invoiceNumber: string) => Invoice | undefined;
  updateInvoice: (
    invoiceId: string,
    updatedData: Partial<Invoice> | Invoice
  ) => void;
  deleteInvoice: (id: string) => Promise<void>;
  addInvoice: (invoice: Invoice) => void;
  clearSearch: () => void;
  refreshInvoices: () => Promise<void>;
  reset: () => void;
}

export interface InvoiceCardProps {
  id: string;
  invoiceNumber: string;
  title: string;
  amount: string;
  customerName: string;
  date: string;
  status: string;
  onDelete?: () => void;
  onEdit?: (id: string) => void;
}
