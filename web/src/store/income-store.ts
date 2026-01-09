// store/income-store.ts
import { create } from 'zustand';
import { api } from '@/lib/axios';
import type {
  IncomeStore,
  IncomeSourceType,
  IncomeRecordStatus,
} from '@/types/income';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const INITIAL_DISPLAY_COUNT = 50;
const LOAD_MORE_COUNT = 25;

export const useIncomeStore = create<IncomeStore>((set, get) => ({
  // Income list data
  allIncome: [],
  displayedIncome: [],
  filteredIncome: [],
  summary: null,
  chartData: null,
  meta: null,

  // Income statement data
  incomeStatement: null,
  incomeStatementChartData: null,
  incomeStatementMeta: null,

  // Loading states
  isInitialLoading: false,
  isPaginating: false,
  isDeleting: false,
  isLoadingStatement: false,
  error: null,

  // Filters
  searchQuery: '',
  displayCount: INITIAL_DISPLAY_COUNT,
  sourceFilter: 'ALL',
  statusFilter: 'ALL',
  dateFilter: null,

  // Cache tracking
  lastFetchTime: null,
  lastStatementFetchTime: null,

  // Income list actions
  fetchIncome: async (forceRefresh = false) => {
    const state = get();
    const now = Date.now();

    if (
      !forceRefresh &&
      state.lastFetchTime &&
      now - state.lastFetchTime < CACHE_DURATION &&
      state.allIncome.length > 0
    ) {
      return;
    }

    set({ isInitialLoading: true, error: null });

    try {
      const response = await api.get('/income');
      const { data, summary, chartData, meta } = response.data;

      set({
        allIncome: data,
        filteredIncome: data,
        displayedIncome: data.slice(0, INITIAL_DISPLAY_COUNT),
        summary,
        chartData,
        meta,
        displayCount: INITIAL_DISPLAY_COUNT,
        lastFetchTime: now,
        isInitialLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch income',
        isInitialLoading: false,
      });
    }
  },

  loadMoreDisplayed: () => {
    const state = get();
    const newCount = state.displayCount + LOAD_MORE_COUNT;

    set({
      displayedIncome: state.filteredIncome.slice(0, newCount),
      displayCount: newCount,
    });
  },

  searchIncome: (query: string) => {
    set({ searchQuery: query });
    get().applyFilters();
  },

  setSourceFilter: (source: IncomeSourceType | 'ALL') => {
    set({ sourceFilter: source });
    get().applyFilters();
  },

  setStatusFilter: (status: IncomeRecordStatus | 'ALL') => {
    set({ statusFilter: status });
    get().applyFilters();
  },

  setDateFilter: (dateRange: { start: any; end: any } | null) => {
    set({ dateFilter: dateRange });
    get().applyFilters();
  },

  applyFilters: () => {
    const state = get();
    let filtered = [...state.allIncome];

    // Apply source filter
    if (state.sourceFilter !== 'ALL') {
      filtered = filtered.filter(
        income => income.sourceType === state.sourceFilter
      );
    }

    // Apply status filter
    if (state.statusFilter !== 'ALL') {
      filtered = filtered.filter(
        income => income.status === state.statusFilter
      );
    }

    // Apply search filter
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(
        income =>
          income.sourceDescription?.toLowerCase().includes(query) ||
          income.customerName?.toLowerCase().includes(query) ||
          income.incomeMainCategory?.toLowerCase().includes(query) ||
          income.incomeSubCategory?.toLowerCase().includes(query) ||
          income.sourceNumber?.toLowerCase().includes(query)
      );
    }

    // Apply date filter
    if (state.dateFilter) {
      filtered = filtered.filter(income => {
        const incomeDate = new Date(income.date);
        const start = state.dateFilter!.start;
        const end = state.dateFilter!.end;
        return incomeDate >= start && incomeDate <= end;
      });
    }

    set({
      filteredIncome: filtered,
      displayedIncome: filtered.slice(0, state.displayCount),
    });
  },

  deleteIncome: async (
    id: string,
    sourceType: IncomeSourceType,
    sourceId: string | null
  ) => {
    set({ isDeleting: true, error: null });

    try {
      if (sourceType === 'OTHER_INCOME' && sourceId) {
        await api.delete(`/income/${sourceId}`);
      } else if (sourceType === 'SALE' && sourceId) {
        await api.delete(`/sales/${sourceId}`);
      } else if (sourceType === 'QUOTATION' && sourceId) {
        await api.delete(`/quotations/${sourceId}`);
      }

      await get().refreshIncome();
    } catch (error: any) {
      set({
        error: error.message || 'Failed to delete income',
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

  refreshIncome: async () => {
    await get().fetchIncome(true);
  },

  // Income statement actions
  fetchIncomeStatement: async (forceRefresh = false) => {
    const state = get();
    const now = Date.now();

    if (
      !forceRefresh &&
      state.lastStatementFetchTime &&
      now - state.lastStatementFetchTime < CACHE_DURATION &&
      state.incomeStatement
    ) {
      return;
    }

    set({ isLoadingStatement: true, error: null });

    try {
      const response = await api.get('/reports/income');
      const { incomeStatement, chartData, meta } = response.data;

      set({
        incomeStatement,
        incomeStatementChartData: chartData,
        incomeStatementMeta: meta,
        lastStatementFetchTime: now,
        isLoadingStatement: false,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch income statement',
        isLoadingStatement: false,
      });
    }
  },

  refreshIncomeStatement: async () => {
    await get().fetchIncomeStatement(true);
  },

  reset: () => {
    set({
      allIncome: [],
      displayedIncome: [],
      filteredIncome: [],
      summary: null,
      chartData: null,
      meta: null,
      incomeStatement: null,
      incomeStatementChartData: null,
      incomeStatementMeta: null,
      isInitialLoading: false,
      isPaginating: false,
      isDeleting: false,
      isLoadingStatement: false,
      error: null,
      searchQuery: '',
      displayCount: INITIAL_DISPLAY_COUNT,
      sourceFilter: 'ALL',
      statusFilter: 'ALL',
      dateFilter: null,
      lastFetchTime: null,
      lastStatementFetchTime: null,
    });
  },
}));
