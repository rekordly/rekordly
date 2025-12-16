// store/Expense-store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/axios';
import { ExpenseStore, Expense, ExpenseSourceType } from '@/types/expenses';
import { addToast } from '@heroui/react';

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

export const useExpenseStore = create<ExpenseStore>()(
  persist(
    (set, get) => ({
      allExpense: [],
      displayedExpenses: [],
      filteredExpenses: [],
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

      fetchExpenses: async (forceRefresh = false) => {
        const { lastFetchTime, allExpense } = get();
        const now = Date.now();

        if (allExpense.length > 0) {
          get().applyFilters();
        }

        const shouldFetch =
          forceRefresh ||
          allExpense.length === 0 ||
          !lastFetchTime ||
          now - lastFetchTime > CACHE_DURATION;

        if (!shouldFetch) {
          return;
        }

        set({
          isInitialLoading: allExpense.length === 0,
          error: null,
        });

        try {
          const response = await api.get('/reports/expense');
          console.log(response.data);
          const { data, summary, chartData, meta } = response.data;

          set({
            allExpense: data || [],
            summary,
            chartData,
            meta,
            isInitialLoading: false,
            lastFetchTime: Date.now(),
          });

          get().applyFilters();
        } catch (error) {
          set({
            error: 'Failed to fetch Expense',
            isInitialLoading: false,
          });
        }
      },

      loadMoreDisplayed: () => {
        const { displayCount, filteredExpenses } = get();

        if (displayCount >= filteredExpenses.length) return;

        set({ isPaginating: true });

        setTimeout(() => {
          const newCount = Math.min(
            displayCount + RENDER_LIMIT,
            filteredExpenses.length
          );

          set({
            displayCount: newCount,
            displayedExpenses: filteredExpenses.slice(0, newCount),
            isPaginating: false,
          });
        }, 300);
      },

      searchExpenses: (query: string) => {
        set({ searchQuery: query, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setSourceFilter: (source: ExpenseSourceType | 'ALL') => {
        set({ sourceFilter: source, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      setDateFilter: (dateRange: { start: any; end: any } | null) => {
        set({ dateFilter: dateRange, displayCount: RENDER_LIMIT });
        get().applyFilters();
      },

      applyFilters: () => {
        const {
          allExpense,
          searchQuery,
          sourceFilter,
          dateFilter,
          displayCount,
        } = get();

        let filtered = [...allExpense];

        // Apply source filter
        if (sourceFilter !== 'ALL') {
          filtered = filtered.filter(
            Expense => Expense.sourceType === sourceFilter
          );
        }

        // Apply date filter
        if (dateFilter && (dateFilter.start || dateFilter.end)) {
          filtered = filtered.filter(Expense => {
            const ExpenseDate = new Date(Expense.date);
            const startDate = dateFilter.start
              ? dateValueToDate(dateFilter.start)
              : null;
            const endDate = dateFilter.end
              ? dateValueToDate(dateFilter.end)
              : null;

            if (startDate && ExpenseDate < startDate) return false;
            if (endDate && ExpenseDate > endDate) return false;

            return true;
          });
        }

        // Apply search filter
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();

          filtered = filtered.filter(Expense => {
            const customerName = Expense.customerName || '';
            const sourceTitle = Expense.sourceTitle || '';
            const sourceNumber = Expense.sourceNumber || '';
            const amount = Expense.amount.toString();
            const notes = Expense.notes || '';

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
          filteredExpenses: filtered,
          displayedExpenses: filtered.slice(0, displayCount),
        });
      },

      deleteExpense: async (
        id: string,
        sourceType: ExpenseSourceType,
        sourceId: string | null
      ) => {
        set({ isDeleting: true });
        try {
          // Delete based on source type
          if (sourceType === 'PURCHASE' && sourceId) {
            await api.delete(`/purchases/${sourceId}`);
          } else if (sourceType === 'OTHER_EXPENSES' && sourceId) {
            await api.delete(`/reports/expense/${id}`);
          } else {
            addToast({
              title: 'Error',
              description: 'Deleted action is not allowed on refunded expenses',
              color: 'danger',
            });
            return;
          }

          const { allExpense } = get();
          const updatedExpense = allExpense.filter(
            Expense => Expense.id !== id
          );

          set({
            allExpense: updatedExpense,
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

      refreshExpense: async () => {
        await get().fetchExpenses(true);
      },

      reset: () => {
        set({
          allExpense: [],
          displayedExpenses: [],
          filteredExpenses: [],
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
      name: 'expense-storage',
      partialize: state => ({
        allExpense: state.allExpense,
        summary: state.summary,
        chartData: state.chartData,
        meta: state.meta,
        lastFetchTime: state.lastFetchTime,
      }),
    }
  )
);
