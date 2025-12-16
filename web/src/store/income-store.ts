// store/income-store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/axios';
import { IncomeStore, Income, IncomeSourceType } from '@/types/income';

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

export const useIncomeStore = create<IncomeStore>()(
  persist(
    (set, get) => ({
      allIncome: [],
      displayedIncome: [],
      filteredIncome: [],
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

      fetchIncome: async (forceRefresh = false) => {
        const { lastFetchTime, allIncome } = get();
        const now = Date.now();

        if (allIncome.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allIncome.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allIncome.length === 0,
          error: null,
        });

        try {
          const response = await api.get('/reports/income');
          console.log(response.data);
          const { data, summary, chartData, meta } = response.data;

          set({
            allIncome: data || [],
            summary,
            chartData,
            meta,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          set({
            error: 'Failed to fetch income',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredIncome } = get();

        if (displayCount >= filteredIncome.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredIncome.length
          );

          set({
            displayCount: newCount,
            displayedIncome: filteredIncome.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchIncome: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setSourceFilter: (source: IncomeSourceType | 'ALL') => {
        set({ sourceFilter: source, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setDateFilter: (dateRange: { start: any; end: any } | null) => {
        set({ dateFilter: dateRange, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const {
          allIncome,
          searchQuery,
          sourceFilter,
          dateFilter,
          displayCount,
        } = get();

        let filtered = [...allIncome];

        // Apply source filter
        if (sourceFilter !== 'ALL') {
          filtered = filtered.filter(
            income => income.sourceType === sourceFilter
          );
        }

        // Apply date filter
        if (dateFilter && (dateFilter.start || dateFilter.end)) {
          filtered = filtered.filter(income => {
            const incomeDate = new Date(income.date);
            const startDate = dateFilter.start
              ? dateValueToDate(dateFilter.start)
              : null;
            const endDate = dateFilter.end
              ? dateValueToDate(dateFilter.end)
              : null;

            if (startDate && incomeDate < startDate) return false;
            if (endDate && incomeDate > endDate) return false;

            return true;
          });
        }

        // Apply search filter
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(income => {
            const customerName = income.customerName || '';
            const sourceTitle = income.sourceTitle || '';
            const sourceNumber = income.sourceNumber || '';
            const amount = income.amount.toString();
            const notes = income.notes || '';

            return (
              customerName.toLowerCase().includes(lowerQuery) ||
              sourceTitle.toLowerCase().includes(lowerQuery) ||
              sourceNumber.toLowerCase().includes(lowerQuery) ||
              amount.includes(lowerQuery) ||
              notes.toLowerCase().includes(lowerQuery)
            );
          });
        }

        // Sort by date (newest first)
        filtered.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        set({
          filteredIncome: filtered,
          displayedIncome: filtered.slice(0, displayCount),
        });
      },

      deleteIncome: async (
        id: string,
        sourceType: IncomeSourceType,
        sourceId: string | null
      ) => {
        set({ isDeleting: true });
        try {
          // Delete based on source type
          if (sourceType === 'SALE' && sourceId) {
            await api.delete(`/sales/${sourceId}`);
          } else if (sourceType === 'QUOTATION' && sourceId) {
            await api.delete(`/quotations/${sourceId}`);
          } else if (sourceType === 'OTHER_INCOME') {
            await api.delete(`/income/${id}`);
          }

          const { allIncome } = get();
          const updatedIncome = allIncome.filter(income => income.id !== id);

          set({
            allIncome: updatedIncome,
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

      refreshIncome: async () => {
        await get().fetchIncome(true);
      },

      reset: () => {
        set({
          allIncome: [],
          displayedIncome: [],
          filteredIncome: [],
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
      name: 'income-storage',
      partialize: state => ({
        allIncome: state.allIncome,
        summary: state.summary,
        chartData: state.chartData,
        meta: state.meta,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
