import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';
import { InvoiceStore, InvoiceStatus } from '@/types/invoice';

const LIMIT = 20; // Items per page

export const useInvoiceStore = create<InvoiceStore>()(
  persist(
    (set, get) => ({
      invoices: [],
      filteredInvoices: [],
      loading: false,
      error: null,
      searchQuery: '',
      hasMore: true,
      page: 1,
      statusFilter: 'ALL',

      fetchInvoices: async () => {
        set({ loading: true, error: null, page: 1 });
        try {
          const response = await axios.get(
            `/api/invoices?page=1&limit=${LIMIT}`
          );
          console.log(response.data.invoices);
          const invoices = response.data.invoices || [];
          const hasMore =
            response.data.pagination.page < response.data.pagination.totalPages;

          set({
            invoices,
            loading: false,
            hasMore,
            page: 1,
          });

          // Apply current filters after fetching
          get().applyFilters();
        } catch (error) {
          console.error('Error fetching invoices:', error);
          set({
            error: 'Failed to fetch invoices',
            loading: false,
          });
        }
      },

      fetchMoreInvoices: async () => {
        const { loading, hasMore, page } = get();

        if (loading || !hasMore) return;

        set({ loading: true });

        try {
          const nextPage = page + 1;
          const response = await axios.get(
            `/api/invoices?page=${nextPage}&limit=${LIMIT}`
          );
          const newInvoices = response.data.invoices || [];
          const hasMorePages =
            response.data.pagination.page < response.data.pagination.totalPages;

          const { invoices } = get();
          const updatedInvoices = [...invoices, ...newInvoices];

          set({
            invoices: updatedInvoices,
            loading: false,
            hasMore: hasMorePages,
            page: nextPage,
          });

          // Re-apply filters after loading more
          get().applyFilters();
        } catch (error) {
          console.error('Error fetching more invoices:', error);
          set({ loading: false });
        }
      },

      searchInvoices: (query: string) => {
        set({ searchQuery: query });
        get().applyFilters();
      },

      setStatusFilter: (status: InvoiceStatus | 'ALL') => {
        set({ statusFilter: status });
        get().applyFilters();
      },

      applyFilters: () => {
        const { invoices, searchQuery, statusFilter } = get();

        let filtered = [...invoices];

        // Apply status filter
        if (statusFilter !== 'ALL') {
          filtered = filtered.filter(
            invoice => invoice.status === statusFilter
          );
        }

        // Apply search filter
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();
          filtered = filtered.filter(invoice => {
            const customerName =
              invoice.customer?.name || invoice.customerName || '';
            const title = invoice.title || '';
            const invoiceNumber = invoice.invoiceNumber || '';
            const amount = invoice.totalAmount.toString();

            return (
              customerName.toLowerCase().includes(lowerQuery) ||
              title.toLowerCase().includes(lowerQuery) ||
              invoiceNumber.toLowerCase().includes(lowerQuery) ||
              amount.includes(lowerQuery)
            );
          });
        }

        set({ filteredInvoices: filtered });
      },

      deleteInvoice: async (id: string) => {
        try {
          await axios.delete(`/api/invoices/${id}`);
          const { invoices } = get();
          const updatedInvoices = invoices.filter(inv => inv.id !== id);

          set({ invoices: updatedInvoices });
          get().applyFilters();
        } catch (error) {
          throw error;
        }
      },

      clearSearch: () => {
        set({ searchQuery: '' });
        get().applyFilters();
      },

      reset: () => {
        set({
          invoices: [],
          filteredInvoices: [],
          loading: false,
          error: null,
          searchQuery: '',
          hasMore: true,
          page: 1,
          statusFilter: 'ALL',
        });
      },
    }),
    {
      name: 'invoice-storage',
      partialize: state => ({
        invoices: state.invoices,
        // Only persist invoices, not loading states or filters
      }),
    }
  )
);
