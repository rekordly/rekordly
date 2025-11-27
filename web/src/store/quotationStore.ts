import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/axios';
import { QuotationStore, Quotation } from '@/types/quotations';
import { QuotationStatusType } from '@/types';

const RENDER_LIMIT = 20;
const CACHE_DURATION = 5 * 60 * 1000;

export const useQuotationStore = create<QuotationStore>()(
  persist(
    (set, get) => ({
      allQuotations: [],
      displayedQuotations: [],
      filteredQuotations: [],
      isInitialLoading: false,
      isPaginating: false,
      error: null,
      searchQuery: '',
      displayCount: RENDER_LIMIT,
      statusFilter: 'ALL',
      lastFetchTime: null,

      fetchQuotations: async (forceRefresh = false) => {
        const { lastFetchTime, allQuotations } = get();
        const now = Date.now();

        if (allQuotations.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allQuotations.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allQuotations.length === 0,
          error: null,
        });

        try {
          const response = await api.get('/quotations?limit=10000');
          const quotations = response.data.quotations || [];

          set({
            allQuotations: quotations,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch {
          set({
            error: 'Failed to fetch quotations',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredQuotations } = get();

        if (displayCount >= filteredQuotations.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredQuotations.length
          );

          set({
            displayCount: newCount,
            displayedQuotations: filteredQuotations.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchQuotations: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setStatusFilter: (status: QuotationStatusType | 'ALL') => {
        set({ statusFilter: status, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const { allQuotations, searchQuery, statusFilter, displayCount } =
          get();

        let filtered = [...allQuotations];

        // Apply status filter
        if (statusFilter !== 'ALL') {
          filtered = filtered.filter(
            quotation => quotation.status === statusFilter
          );
        }

        // Apply search filter (local search)
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(quotation => {
            const customerName =
              quotation.customer?.name || quotation.customerName || '';
            const title = quotation.title || '';
            const quotationNumber = quotation.quotationNumber || '';
            const amount = quotation.totalAmount.toString();

            return (
              customerName.toLowerCase().includes(lowerQuery) ||
              title.toLowerCase().includes(lowerQuery) ||
              quotationNumber.toLowerCase().includes(lowerQuery) ||
              amount.includes(lowerQuery)
            );
          });
        }

        // Sort by date (newest first)
        filtered.sort(
          (a, b) =>
            new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
        );

        set({
          filteredQuotations: filtered,
          displayedQuotations: filtered.slice(0, displayCount),
        });
      },

      searchQuotationsInDB: async (query: string) => {
        const { filteredQuotations } = get();

        if (filteredQuotations.length > 0 || !query.trim()) {
          return;
        }

        set({ isPaginating: true });

        try {
          const response = await api.get(
            `/quotations/search?q=${encodeURIComponent(query)}`
          );
          const results = response.data.quotations || [];

          const { allQuotations } = get();
          const existingIds = new Set(allQuotations.map(quot => quot.id));
          const newQuotations = results.filter(
            (quot: any) => !existingIds.has(quot.id)
          );

          set({
            allQuotations: [...allQuotations, ...newQuotations],
            isPaginating: false,
          });

          get().applyFilters();
        } catch {
          set({ isPaginating: false });
        }
      },

      // ✅ Get single quotation by quotation number
      getQuotationByNumber: (
        quotationNumber: string
      ): Quotation | undefined => {
        const { allQuotations } = get();

        return allQuotations.find(
          quot => quot.quotationNumber === quotationNumber
        );
      },

      updateQuotation: (
        quotationId: string,
        updatedData: Partial<Quotation>
      ) => {
        const { allQuotations } = get();
        const updatedQuotations = allQuotations.map(quot =>
          quot.id === quotationId ? { ...quot, ...updatedData } : quot
        );

        set({
          allQuotations: updatedQuotations,
          lastFetchTime: Date.now(),
        });

        get().applyFilters();
      },

      addQuotation: (quotation: Quotation) => {
        const { allQuotations } = get();

        set({ allQuotations: [...allQuotations, quotation] });
        get().applyFilters();
      },

      deleteQuotation: async (id: string) => {
        await api.delete(`/quotations/${id}`);
        const { allQuotations } = get();
        const updatedQuotations = allQuotations.filter(quot => quot.id !== id);

        set({
          allQuotations: updatedQuotations,
          lastFetchTime: Date.now(),
        });
        get().applyFilters();
      },

      clearSearch: () => {
        set({ searchQuery: '', displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      refreshQuotations: async () => {
        await get().fetchQuotations(true);
      },

      reset: () => {
        set({
          allQuotations: [],
          displayedQuotations: [],
          filteredQuotations: [],
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
      name: 'quotation-storage',
      partialize: state => ({
        allQuotations: state.allQuotations,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
