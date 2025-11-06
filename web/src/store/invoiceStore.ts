import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/axios';
import { InvoiceStore, InvoiceStatus, Invoice } from '@/types/invoices';

const RENDER_LIMIT = 20;
const CACHE_DURATION = 5 * 60 * 1000;

export const useInvoiceStore = create<InvoiceStore>()(
  persist(
    (set, get) => ({
      allInvoices: [],
      displayedInvoices: [],
      filteredInvoices: [],
      isInitialLoading: false,
      isPaginating: false,
      error: null,
      searchQuery: '',
      displayCount: RENDER_LIMIT,
      statusFilter: 'ALL',
      lastFetchTime: null,

      fetchInvoices: async (forceRefresh = false) => {
        const { lastFetchTime, allInvoices } = get();
        const now = Date.now();

        if (allInvoices.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allInvoices.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allInvoices.length === 0,
          error: null,
        });

        try {
          const response = await api.get('/invoices?limit=10000');
          const invoices = response.data.invoices || [];

          set({
            allInvoices: invoices,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          console.error('Error fetching invoices:', error);
          set({
            error: 'Failed to fetch invoices',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredInvoices } = get();

        if (displayCount >= filteredInvoices.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredInvoices.length
          );

          set({
            displayCount: newCount,
            displayedInvoices: filteredInvoices.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchInvoices: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setStatusFilter: (status: InvoiceStatus | 'ALL') => {
        set({ statusFilter: status, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const { allInvoices, searchQuery, statusFilter, displayCount } = get();

        let filtered = [...allInvoices];

        if (statusFilter !== 'ALL') {
          filtered = filtered.filter(
            invoice => invoice.status === statusFilter
          );
        }

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

        filtered.sort(
          (a, b) =>
            new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
        );

        set({
          filteredInvoices: filtered,
          displayedInvoices: filtered.slice(0, displayCount),
        });
      },

      searchInvoicesInDB: async (query: string) => {
        const { filteredInvoices } = get();

        if (filteredInvoices.length > 0 || !query.trim()) {
          return;
        }

        set({ isPaginating: true });

        try {
          const response = await api.get(
            `/invoices/search?q=${encodeURIComponent(query)}`
          );
          const results = response.data.invoices || [];

          const { allInvoices } = get();
          const existingIds = new Set(allInvoices.map(inv => inv.id));
          const newInvoices = results.filter(
            (inv: any) => !existingIds.has(inv.id)
          );

          set({
            allInvoices: [...allInvoices, ...newInvoices],
            isPaginating: false,
          });

          get().applyFilters();
        } catch (error) {
          console.error('Error searching invoices:', error);
          set({ isPaginating: false });
        }
      },

      getInvoiceByNumber: (invoiceNumber: string): Invoice | undefined => {
        const { allInvoices } = get();

        return allInvoices.find(inv => inv.invoiceNumber === invoiceNumber);
      },

      updateInvoice: (
        invoiceId: string,
        updatedData: Partial<Invoice> | Invoice
      ) => {
        const { allInvoices } = get();
        const updatedInvoices = allInvoices.map(inv =>
          inv.id === invoiceId ? { ...inv, ...updatedData } : inv
        );

        set({
          allInvoices: updatedInvoices,
          lastFetchTime: Date.now(),
        });

        get().applyFilters();
      },

      addInvoice: (invoice: Invoice) => {
        const { allInvoices } = get();

        set({ allInvoices: [...allInvoices, invoice] });
        get().applyFilters();
      },

      deleteInvoice: async (id: string) => {
        try {
          await api.delete(`/invoices/${id}`);
          const { allInvoices } = get();
          const updatedInvoices = allInvoices.filter(inv => inv.id !== id);

          set({
            allInvoices: updatedInvoices,
            lastFetchTime: Date.now(),
          });
          get().applyFilters();
        } catch (error) {
          throw error;
        }
      },

      clearSearch: () => {
        set({ searchQuery: '', displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      refreshInvoices: async () => {
        await get().fetchInvoices(true);
      },

      reset: () => {
        set({
          allInvoices: [],
          displayedInvoices: [],
          filteredInvoices: [],
          isInitialLoading: false,
          isPaginating: false,
          error: null,
          searchQuery: '',
          displayCount: RENDER_LIMIT,
          statusFilter: 'ALL',
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'invoice-storage',
      partialize: state => ({
        allInvoices: state.allInvoices,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
