// store/expense-store.ts
import { create } from 'zustand';
import { api } from '@/lib/axios';
import type {
  ExpenseStore,
  ExpenseSourceType,
  ExpenseStatus,
} from '@/types/expenses';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const INITIAL_DISPLAY_COUNT = 50;
const LOAD_MORE_COUNT = 25;

export const useExpenseStore = create<ExpenseStore>((set, get) => ({
  // State
  allExpenses: [],
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
  displayCount: INITIAL_DISPLAY_COUNT,
  sourceFilter: 'ALL',
  statusFilter: 'ALL',
  dateFilter: null,
  lastFetchTime: null,

  // Actions
  fetchExpenses: async (forceRefresh = false) => {
    const state = get();
    const now = Date.now();

    // Use cache if available and not forcing refresh
    if (
      !forceRefresh &&
      state.lastFetchTime &&
      now - state.lastFetchTime < CACHE_DURATION &&
      state.allExpenses.length > 0
    ) {
      return;
    }

    set({ isInitialLoading: true, error: null });

    try {
      const response = await api.get('/expenses');
      const { data, summary, chartData, meta } = response.data;

      set({
        allExpenses: data,
        filteredExpenses: data,
        displayedExpenses: data.slice(0, INITIAL_DISPLAY_COUNT),
        summary,
        chartData,
        meta,
        displayCount: INITIAL_DISPLAY_COUNT,
        lastFetchTime: now,
        isInitialLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch expenses',
        isInitialLoading: false,
      });
    }
  },

  loadMoreDisplayed: () => {
    const state = get();
    const newCount = state.displayCount + LOAD_MORE_COUNT;

    set({
      displayedExpenses: state.filteredExpenses.slice(0, newCount),
      displayCount: newCount,
    });
  },

  searchExpenses: (query: string) => {
    set({ searchQuery: query });
    get().applyFilters();
  },

  setSourceFilter: (source: ExpenseSourceType | 'ALL') => {
    set({ sourceFilter: source });
    get().applyFilters();
  },

  setStatusFilter: (status: ExpenseStatus | 'ALL') => {
    set({ statusFilter: status });
    get().applyFilters();
  },

  setDateFilter: (dateRange: { start: any; end: any } | null) => {
    set({ dateFilter: dateRange });
    get().applyFilters();
  },

  applyFilters: () => {
    const state = get();
    let filtered = [...state.allExpenses];

    // Apply source filter
    if (state.sourceFilter !== 'ALL') {
      filtered = filtered.filter(
        expense => expense.sourceType === state.sourceFilter
      );
    }

    // Apply status filter
    if (state.statusFilter !== 'ALL') {
      filtered = filtered.filter(
        expense => expense.status === state.statusFilter
      );
    }

    // Apply search filter
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(
        expense =>
          expense.sourceDescription?.toLowerCase().includes(query) ||
          expense.vendorName?.toLowerCase().includes(query) ||
          expense.category?.toLowerCase().includes(query) ||
          expense.subCategory?.toLowerCase().includes(query) ||
          expense.sourceNumber?.toLowerCase().includes(query)
      );
    }

    // Apply date filter
    if (state.dateFilter) {
      filtered = filtered.filter(expense => {
        const expenseDate = new Date(expense.date);
        const start = state.dateFilter!.start;
        const end = state.dateFilter!.end;
        return expenseDate >= start && expenseDate <= end;
      });
    }

    set({
      filteredExpenses: filtered,
      displayedExpenses: filtered.slice(0, state.displayCount),
    });
  },

  deleteExpense: async (
    id: string,
    sourceType: ExpenseSourceType,
    sourceId: string | null
  ) => {
    set({ isDeleting: true, error: null });

    try {
      if (sourceType === 'EXPENSE' && sourceId) {
        await api.delete(`/expenses/${sourceId}`);
      } else if (sourceType === 'PURCHASE' && sourceId) {
        await api.delete(`/purchases/${sourceId}`);
      }

      // Refresh expenses after deletion
      await get().refreshExpenses();
    } catch (error: any) {
      set({
        error: error.message || 'Failed to delete expense',
        isDeleting: false,
      });
      throw error;
    } finally {
      set({ isDeleting: false });
    }
  },

  clearSearch: () => {
    set({ searchQuery: '' });
    get().applyFilters();
  },

  refreshExpenses: async () => {
    await get().fetchExpenses(true);
  },

  reset: () => {
    set({
      allExpenses: [],
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
      displayCount: INITIAL_DISPLAY_COUNT,
      sourceFilter: 'ALL',
      statusFilter: 'ALL',
      dateFilter: null,
      lastFetchTime: null,
    });
  },
}));
