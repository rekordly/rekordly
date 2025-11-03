import { z } from 'zod';
import {
  customerSchema,
  invoiceItemSchema,
  invoiceSchema,
  addItemSchema,
  convertToSalesSchema,
} from '@/lib/validations/invoice';

export type CustomerType = z.infer<typeof customerSchema>;
export type InvoiceItemType = z.infer<typeof invoiceItemSchema>;
export type InvoiceFormType = z.infer<typeof invoiceSchema>;
export type AddItemFormType = z.infer<typeof addItemSchema>;
export type ConvertToSalesType = z.infer<typeof convertToSalesSchema>;

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
    payments: JSON | null;
  };
}

export interface InvoiceStore {
  allInvoices: Invoice[]; // All fetched invoices
  displayedInvoices: Invoice[]; // Currently rendered invoices
  filteredInvoices: Invoice[]; // After applying filters
  isInitialLoading: boolean; // Shows skeleton on first load only
  isPaginating: boolean; // Shows spinner when loading more
  error: string | null;
  searchQuery: string;
  displayCount: number; // Number of invoices to display
  statusFilter: InvoiceStatus | 'ALL';
  lastFetchTime: number | null; // Track cache freshness

  // Actions
  fetchInvoices: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void; // Load more to display
  searchInvoices: (query: string) => void;
  searchInvoicesInDB: (query: string) => Promise<void>; // Fallback DB search
  setStatusFilter: (status: InvoiceStatus | 'ALL') => void;
  applyFilters: () => void;
  getInvoiceByNumber: (invoiceNumber: string) => Invoice | undefined; // Get single invoice
  updateInvoice: (invoiceId: string, updatedData: Partial<Invoice>) => void; // Update invoice
  deleteInvoice: (id: string) => Promise<void>;
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
  status?: string;
  date: string;
  iconBgColor?: string;
  amountColor?: string;
  onDelete?: () => void;
}
