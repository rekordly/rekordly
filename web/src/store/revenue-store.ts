// store/revenue-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/axios';
import { RevenueStore, RevenueItem, RevenueSourceType } from '@/types/revenue';

const RENDER_LIMIT = 20;
const CACHE_DURATION = 5 * 60 * 1000;

// Helper function to convert DateValue to Date
const dateValueToDate = (dateValue: any): Date => {
  if (!dateValue) return new Date();
  if (dateValue instanceof Date) return dateValue;
  if (dateValue.year && dateValue.month && dateValue.day) {
    return new Date(dateValue.year, dateValue.month - 1, dateValue.day);
  }
  return new Date(dateValue);
};

export const useRevenueStore = create<RevenueStore>()(
  persist(
    (set, get) => ({
      allRevenue: [],
      displayedRevenue: [],
      filteredRevenue: [],
      summary: null,
      chartData: null,
      meta: null,
      isInitialLoading: false,
      isPaginating: false,
      isDeleting: false,
      error: null,
      searchQuery: '',
      displayCount: RENDER_LIMIT,
      sourceFilter: 'ALL',
      dateFilter: null,
      lastFetchTime: null,

      fetchRevenue: async (forceRefresh = false) => {
        const { lastFetchTime, allRevenue } = get();
        const now = Date.now();

        if (allRevenue.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allRevenue.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allRevenue.length === 0,
          error: null,
        });

        try {
          const response = await api.get('/reports/revenue');
          console.log('Revenue data:', response.data);
          const { data, summary, chartData, meta } = response.data;

          set({
            allRevenue: data || [],
            summary,
            chartData,
            meta,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          set({
            error: 'Failed to fetch revenue',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredRevenue } = get();

        if (displayCount >= filteredRevenue.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredRevenue.length
          );

          set({
            displayCount: newCount,
            displayedRevenue: filteredRevenue.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchRevenue: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setSourceFilter: (source: RevenueSourceType | 'ALL') => {
        set({ sourceFilter: source, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setDateFilter: (dateRange: { start: any; end: any } | null) => {
        set({ dateFilter: dateRange, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const {
          allRevenue,
          searchQuery,
          sourceFilter,
          dateFilter,
          displayCount,
        } = get();

        let filtered = [...allRevenue];

        // Apply source filter
        if (sourceFilter !== 'ALL') {
          filtered = filtered.filter(revenue => revenue.type === sourceFilter);
        }

        // Apply date filter
        if (dateFilter && (dateFilter.start || dateFilter.end)) {
          filtered = filtered.filter(revenue => {
            const revenueDate = new Date(revenue.date);
            const startDate = dateFilter.start
              ? dateValueToDate(dateFilter.start)
              : null;
            const endDate = dateFilter.end
              ? dateValueToDate(dateFilter.end)
              : null;

            if (startDate && revenueDate < startDate) return false;
            if (endDate && revenueDate > endDate) return false;

            return true;
          });
        }

        // Apply search filter
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(revenue => {
            const customerName = revenue.customerName || '';
            const title = revenue.title || '';
            const number = revenue.number || '';
            const amount = revenue.totalAmount.toString();
            const description = revenue.description || '';

            return (
              customerName.toLowerCase().includes(lowerQuery) ||
              title.toLowerCase().includes(lowerQuery) ||
              number.toLowerCase().includes(lowerQuery) ||
              amount.includes(lowerQuery) ||
              description.toLowerCase().includes(lowerQuery)
            );
          });
        }

        // Sort by date (newest first)
        filtered.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        set({
          filteredRevenue: filtered,
          displayedRevenue: filtered.slice(0, displayCount),
        });
      },

      deleteRevenue: async (
        id: string,
        sourceType: RevenueSourceType,
        sourceId: string
      ) => {
        set({ isDeleting: true });
        try {
          // Delete based on source type
          if (sourceType === 'SALE') {
            await api.delete(`/sales/${sourceId}`);
          } else if (sourceType === 'QUOTATION') {
            await api.delete(`/quotations/${sourceId}`);
          } else if (sourceType === 'OTHER_INCOME') {
            await api.delete(`/income/${sourceId}`);
          }

          const { allRevenue } = get();
          const updatedRevenue = allRevenue.filter(
            revenue => revenue.id !== id
          );

          set({
            allRevenue: updatedRevenue,
            lastFetchTime: Date.now(),
            isDeleting: false,
          });
          get().applyFilters();
        } catch (error) {
          set({ isDeleting: false });
          throw error;
        }
      },

      clearSearch: () => {
        set({ searchQuery: '', displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      refreshRevenue: async () => {
        await get().fetchRevenue(true);
      },

      reset: () => {
        set({
          allRevenue: [],
          displayedRevenue: [],
          filteredRevenue: [],
          summary: null,
          chartData: null,
          meta: null,
          isInitialLoading: false,
          isPaginating: false,
          isDeleting: false,
          error: null,
          searchQuery: '',
          displayCount: RENDER_LIMIT,
          sourceFilter: 'ALL',
          dateFilter: null,
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'revenue-storage',
      partialize: state => ({
        allRevenue: state.allRevenue,
        summary: state.summary,
        chartData: state.chartData,
        meta: state.meta,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
