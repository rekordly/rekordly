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
  | 'PAID'
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
  invoices: Invoice[];
  filteredInvoices: Invoice[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  hasMore: boolean;
  page: number;
  statusFilter: InvoiceStatus | 'ALL';

  // Actions
  fetchInvoices: () => Promise<void>;
  fetchMoreInvoices: () => Promise<void>;
  searchInvoices: (query: string) => void;
  deleteInvoice: (id: string) => Promise<void>;
  clearSearch: () => void;
  setStatusFilter: (status: InvoiceStatus | 'ALL') => void;
  applyFilters: () => void;
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
