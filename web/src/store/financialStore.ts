import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/axios';

// Types
export type DateRangeType =
  | 'thisYear'
  | 'lastYear'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

export interface DateRange {
  range: DateRangeType;
  startDate?: string;
  endDate?: string;
}

export interface RevenueItem {
  id: string;
  date: Date;
  amount: number;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  sourceType: 'SALE' | 'QUOTATION' | 'OTHER_INCOME';
  sourceId?: string;
  sourceNumber?: string;
  sourceTitle?: string;
  sourceDescription?: string;
  sourceTotalAmount?: number;
  sourceAmountPaid?: number;
  sourceBalance?: number;
  sourceStatus?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  includesVAT?: boolean;
  vatAmount?: number;
  incomeMainCategory?: string;
  incomeSubCategory?: string;
  customSubCategory?: string;
}

export interface ExpenseItem {
  id: string;
  date: Date;
  amount: number;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  sourceType: 'PURCHASE' | 'OTHER_EXPENSES';
  sourceId?: string;
  sourceNumber?: string;
  sourceTitle?: string;
  sourceDescription?: string;
  sourceTotalAmount?: number;
  sourceAmountPaid?: number;
  sourceBalance?: number;
  sourceStatus?: string;
  category?: string;
  subCategory?: string;
  vendorName?: string;
  vendorEmail?: string;
  vendorPhone?: string;
  isDeductible?: boolean;
  deductionPercentage?: number;
  includesVAT?: boolean;
  vatAmount?: number;
}

export interface MonthlyData {
  month: string;
  revenue: number;
  expense: number;
  profit: number;
}

export interface ChartData {
  name: string;
  value: number;
  percentage: number;
  color?: string;
}

export interface RevenueSummary {
  totalRevenue: number;
  totalPaid: number;
  averagePerMonth: number;
  topSource: string;
  bySource: Record<string, number>;
  byPaymentMethod: Record<string, number>;
}

export interface ExpenseSummary {
  totalExpense: number;
  totalPaid: number;
  averagePerMonth: number;
  topCategory: string;
  totalDeductible: number;
  totalNonDeductible: number;
  deductiblePercentage: number;
  byCategory: Record<string, number>;
  byPaymentMethod: Record<string, number>;
}

export interface FinancialStore {
  // Revenue state
  revenueItems: RevenueItem[];
  revenueSummary: RevenueSummary | null;
  revenueChartData: {
    monthly: MonthlyData[];
    bySource: ChartData[];
  } | null;
  revenueLoading: boolean;
  revenueError: string | null;
  revenueDateRange: DateRange;
  revenueLastFetch: number | null;

  // Expense state
  expenseItems: ExpenseItem[];
  expenseSummary: ExpenseSummary | null;
  expenseChartData: {
    monthly: MonthlyData[];
    byCategory: ChartData[];
  } | null;
  expenseLoading: boolean;
  expenseError: string | null;
  expenseDateRange: DateRange;
  expenseLastFetch: number | null;

  // Combined/Dashboard state
  combinedMonthlyData: MonthlyData[];
  totalProfit: number;
  profitMargin: number;

  // Actions
  fetchRevenue: (
    dateRange?: DateRange,
    forceRefresh?: boolean
  ) => Promise<void>;
  fetchExpenses: (
    dateRange?: DateRange,
    forceRefresh?: boolean
  ) => Promise<void>;
  fetchBoth: (dateRange?: DateRange, forceRefresh?: boolean) => Promise<void>;
  setRevenueDateRange: (range: DateRange) => void;
  setExpenseDateRange: (range: DateRange) => void;
  calculateCombinedData: () => void;
  reset: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const buildQueryString = (dateRange: DateRange): string => {
  const params = new URLSearchParams();
  params.append('range', dateRange.range);
  if (dateRange.startDate) params.append('startDate', dateRange.startDate);
  if (dateRange.endDate) params.append('endDate', dateRange.endDate);
  return params.toString();
};

export const useFinancialStore = create<FinancialStore>()(
  persist(
    (set, get) => ({
      // Initial state
      revenueItems: [],
      revenueSummary: null,
      revenueChartData: null,
      revenueLoading: false,
      revenueError: null,
      revenueDateRange: { range: 'thisYear' },
      revenueLastFetch: null,

      expenseItems: [],
      expenseSummary: null,
      expenseChartData: null,
      expenseLoading: false,
      expenseError: null,
      expenseDateRange: { range: 'thisYear' },
      expenseLastFetch: null,

      combinedMonthlyData: [],
      totalProfit: 0,
      profitMargin: 0,

      // Fetch revenue
      fetchRevenue: async (dateRange, forceRefresh = false) => {
        const { revenueLastFetch, revenueDateRange } = get();
        const now = Date.now();
        const range = dateRange || revenueDateRange;

        // Check if we need to fetch
        const shouldFetch =
          forceRefresh ||
          !revenueLastFetch ||
          now - revenueLastFetch > CACHE_DURATION ||
          JSON.stringify(range) !== JSON.stringify(revenueDateRange);

        if (!shouldFetch) {
          return;
        }

        set({
          revenueLoading: true,
          revenueError: null,
          revenueDateRange: range,
        });

        try {
          const queryString = buildQueryString(range);
          const response = await api.get(`/reports/income?${queryString}`);
          const data = response.data;
          console.log(data);

          set({
            revenueItems: data.data || [],
            revenueSummary: data.summary || null,
            revenueChartData: data.chartData || null,
            revenueLoading: false,
            revenueLastFetch: now,
          });

          // Recalculate combined data
          get().calculateCombinedData();
        } catch (error: any) {
          set({
            revenueError:
              error.response?.data?.message || 'Failed to fetch revenue data',
            revenueLoading: false,
          });
        }
      },

      // Fetch expenses
      fetchExpenses: async (dateRange, forceRefresh = false) => {
        const { expenseLastFetch, expenseDateRange } = get();
        const now = Date.now();
        const range = dateRange || expenseDateRange;

        // Check if we need to fetch
        const shouldFetch =
          forceRefresh ||
          !expenseLastFetch ||
          now - expenseLastFetch > CACHE_DURATION ||
          JSON.stringify(range) !== JSON.stringify(expenseDateRange);

        if (!shouldFetch) {
          return;
        }

        set({
          expenseLoading: true,
          expenseError: null,
          expenseDateRange: range,
        });

        try {
          const queryString = buildQueryString(range);
          const response = await api.get(`/reports/expense?${queryString}`);
          const data = response.data;

          set({
            expenseItems: data.data || [],
            expenseSummary: data.summary || null,
            expenseChartData: data.chartData || null,
            expenseLoading: false,
            expenseLastFetch: now,
          });

          // Recalculate combined data
          get().calculateCombinedData();
        } catch (error: any) {
          set({
            expenseError:
              error.response?.data?.message || 'Failed to fetch expense data',
            expenseLoading: false,
          });
        }
      },

      // Fetch both revenue and expenses
      fetchBoth: async (dateRange, forceRefresh = false) => {
        const range = dateRange || { range: 'thisYear' as DateRangeType };

        await Promise.all([
          get().fetchRevenue(range, forceRefresh),
          get().fetchExpenses(range, forceRefresh),
        ]);
      },

      // Set revenue date range
      setRevenueDateRange: (range: DateRange) => {
        set({ revenueDateRange: range });
        get().fetchRevenue(range);
      },

      // Set expense date range
      setExpenseDateRange: (range: DateRange) => {
        set({ expenseDateRange: range });
        get().fetchExpenses(range);
      },

      // Calculate combined data for dashboard
      calculateCombinedData: () => {
        const {
          revenueChartData,
          expenseChartData,
          revenueSummary,
          expenseSummary,
        } = get();

        if (!revenueChartData?.monthly || !expenseChartData?.monthly) {
          return;
        }

        // Combine monthly data
        const monthsMap = new Map<string, MonthlyData>();

        // Add revenue data
        revenueChartData.monthly.forEach(item => {
          monthsMap.set(item.month, {
            month: item.month,
            revenue: item.revenue || 0,
            expense: 0,
            profit: 0,
          });
        });

        // Add expense data
        expenseChartData.monthly.forEach(item => {
          const existing = monthsMap.get(item.month);
          if (existing) {
            existing.expense = item.expense || 0;
            existing.profit = existing.revenue - existing.expense;
          } else {
            monthsMap.set(item.month, {
              month: item.month,
              revenue: 0,
              expense: item.expense || 0,
              profit: -(item.expense || 0),
            });
          }
        });

        const combinedMonthlyData = Array.from(monthsMap.values()).sort(
          (a, b) => {
            const monthOrder = [
              'Jan',
              'Feb',
              'Mar',
              'Apr',
              'May',
              'Jun',
              'Jul',
              'Aug',
              'Sep',
              'Oct',
              'Nov',
              'Dec',
            ];
            return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
          }
        );

        // Calculate totals
        const totalRevenue = revenueSummary?.totalRevenue || 0;
        const totalExpense = expenseSummary?.totalExpense || 0;
        const totalProfit = totalRevenue - totalExpense;
        const profitMargin =
          totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

        set({
          combinedMonthlyData,
          totalProfit,
          profitMargin,
        });
      },

      // Reset store
      reset: () => {
        set({
          revenueItems: [],
          revenueSummary: null,
          revenueChartData: null,
          revenueLoading: false,
          revenueError: null,
          revenueDateRange: { range: 'thisYear' },
          revenueLastFetch: null,

          expenseItems: [],
          expenseSummary: null,
          expenseChartData: null,
          expenseLoading: false,
          expenseError: null,
          expenseDateRange: { range: 'thisYear' },
          expenseLastFetch: null,

          combinedMonthlyData: [],
          totalProfit: 0,
          profitMargin: 0,
        });
      },
    }),
    {
      name: 'financial-storage',
      partialize: state => ({
        revenueItems: state.revenueItems,
        revenueSummary: state.revenueSummary,
        revenueChartData: state.revenueChartData,
        revenueLastFetch: state.revenueLastFetch,
        revenueDateRange: state.revenueDateRange,

        expenseItems: state.expenseItems,
        expenseSummary: state.expenseSummary,
        expenseChartData: state.expenseChartData,
        expenseLastFetch: state.expenseLastFetch,
        expenseDateRange: state.expenseDateRange,

        combinedMonthlyData: state.combinedMonthlyData,
        totalProfit: state.totalProfit,
        profitMargin: state.profitMargin,
      }),
    }
  )
);
