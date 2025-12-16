// store/cashflow-store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/axios';
import {
  CashFlowStore,
  CashFlowItem,
  CashFlowCategory,
  CashFlowType,
  CashFlowSourceType,
} from '@/types/cashflow';

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

export const useCashFlowStore = create<CashFlowStore>()(
  persist(
    (set, get) => ({
      allCashFlow: [],
      displayedCashFlow: [],
      filteredCashFlow: [],
      summary: null,
      chartData: null,
      meta: null,
      isInitialLoading: false,
      isPaginating: false,
      error: null,
      searchQuery: '',
      displayCount: RENDER_LIMIT,
      categoryFilter: 'ALL',
      flowTypeFilter: 'ALL',
      sourceTypeFilter: 'ALL',
      dateFilter: null,
      lastFetchTime: null,

      fetchCashFlow: async (forceRefresh = false) => {
        const { lastFetchTime, allCashFlow } = get();
        const now = Date.now();

        if (allCashFlow.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allCashFlow.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allCashFlow.length === 0,
          error: null,
        });

        try {
          const response = await api.get('/reports/cashflow');
          console.log(response.data);
          const { data, summary, chartData, meta } = response.data;

          set({
            allCashFlow: data || [],
            summary,
            chartData,
            meta,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          set({
            error: 'Failed to fetch cash flow',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredCashFlow } = get();

        if (displayCount >= filteredCashFlow.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredCashFlow.length
          );

          set({
            displayCount: newCount,
            displayedCashFlow: filteredCashFlow.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchCashFlow: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setCategoryFilter: (category: CashFlowCategory | 'ALL') => {
        set({ categoryFilter: category, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setFlowTypeFilter: (flowType: CashFlowType | 'ALL') => {
        set({ flowTypeFilter: flowType, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setSourceTypeFilter: (sourceType: CashFlowSourceType | 'ALL') => {
        set({ sourceTypeFilter: sourceType, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setDateFilter: (dateRange: { start: any; end: any } | null) => {
        set({ dateFilter: dateRange, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const {
          allCashFlow,
          searchQuery,
          categoryFilter,
          flowTypeFilter,
          sourceTypeFilter,
          dateFilter,
          displayCount,
        } = get();

        let filtered = [...allCashFlow];

        // Apply category filter
        if (categoryFilter !== 'ALL') {
          filtered = filtered.filter(
            item => item.flowCategory === categoryFilter
          );
        }

        // Apply flow type filter
        if (flowTypeFilter !== 'ALL') {
          filtered = filtered.filter(item => item.flowType === flowTypeFilter);
        }

        // Apply source type filter
        if (sourceTypeFilter !== 'ALL') {
          filtered = filtered.filter(
            item => item.sourceType === sourceTypeFilter
          );
        }

        // Apply date filter
        if (dateFilter && (dateFilter.start || dateFilter.end)) {
          filtered = filtered.filter(item => {
            const itemDate = new Date(item.date);
            const startDate = dateFilter.start
              ? dateValueToDate(dateFilter.start)
              : null;
            const endDate = dateFilter.end
              ? dateValueToDate(dateFilter.end)
              : null;

            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;

            return true;
          });
        }

        // Apply search filter
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(item => {
            const description = item.description || '';
            const customerName = item.customerName || '';
            const vendorName = item.vendorName || '';
            const sourceNumber = item.sourceNumber || '';
            const amount = item.amount.toString();
            const notes = item.notes || '';
            const reference = item.reference || '';
            const loanNumber = item.loanNumber || '';
            const shareholderName = item.shareholderName || '';

            return (
              description.toLowerCase().includes(lowerQuery) ||
              customerName.toLowerCase().includes(lowerQuery) ||
              vendorName.toLowerCase().includes(lowerQuery) ||
              sourceNumber.toLowerCase().includes(lowerQuery) ||
              amount.includes(lowerQuery) ||
              notes.toLowerCase().includes(lowerQuery) ||
              reference.toLowerCase().includes(lowerQuery) ||
              loanNumber.toLowerCase().includes(lowerQuery) ||
              shareholderName.toLowerCase().includes(lowerQuery)
            );
          });
        }

        // Sort by date (newest first)
        filtered.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        set({
          filteredCashFlow: filtered,
          displayedCashFlow: filtered.slice(0, displayCount),
        });
      },

      clearSearch: () => {
        set({ searchQuery: '', displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      refreshCashFlow: async () => {
        await get().fetchCashFlow(true);
      },

      reset: () => {
        set({
          allCashFlow: [],
          displayedCashFlow: [],
          filteredCashFlow: [],
          summary: null,
          chartData: null,
          meta: null,
          isInitialLoading: false,
          isPaginating: false,
          error: null,
          searchQuery: '',
          displayCount: RENDER_LIMIT,
          categoryFilter: 'ALL',
          flowTypeFilter: 'ALL',
          sourceTypeFilter: 'ALL',
          dateFilter: null,
          lastFetchTime: null,
        });
      },
    }),
    {
      name: 'cashflow-storage',
      partialize: state => ({
        allCashFlow: state.allCashFlow,
        summary: state.summary,
        chartData: state.chartData,
        meta: state.meta,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
