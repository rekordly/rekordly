// types/revenue.ts
import { PaymentMethod } from '@/types/index';

export type RevenueSourceType = 'SALE' | 'QUOTATION' | 'OTHER_INCOME';

export type RevenueStatusType =
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export interface RevenueItem {
  id: string;
  date: string;
  type: RevenueSourceType;
  number: string | null;
  customerName: string | null;
  title: string | null;
  description: string | null;
  totalAmount: number;
  refundAmount: number;
  netAmount: number;
  amountPaid: number;
  balance: number;
  status: RevenueStatusType | string;
  includesVAT: boolean;
  vatAmount: number | null;

  // Other income specific fields
  mainCategory?: string;
  subCategory?: string;
  customSubCategory?: string;
  taxablePercentage?: number | null;
}

export interface RevenueBySource {
  sales: {
    revenue: number;
    refunds: number;
    netRevenue: number;
    cashCollected: number;
    outstanding: number;
  };
  quotations: {
    revenue: number;
    refunds: number;
    netRevenue: number;
    cashCollected: number;
    outstanding: number;
  };
  otherIncome: {
    revenue: number;
    cashCollected: number;
  };
}

export interface RevenueSummary {
  // Accrual Basis
  totalRevenueAccrual: number;
  totalRefunds: number;
  netRevenueAccrual: number;

  // Cash Basis
  totalCashCollected: number;
  totalOutstanding: number;

  // Breakdown
  bySource: RevenueBySource;

  // Averages
  averagePerMonth: string;
}

export interface RevenueSourceBreakdown {
  name: string;
  value: number;
  percentage: string;
}

export interface RevenueChartData {
  monthly: Array<{
    month: string;
    amount: number;
    count: number;
  }>;
  bySource: RevenueSourceBreakdown[];
}

export interface RevenueMeta {
  type: 'revenue';
  range: string;
  startDate: string;
  endDate: string;
  totalRecords: number;
  currency: string;
}

export interface RevenueResponse {
  success: boolean;
  meta: RevenueMeta;
  summary: RevenueSummary;
  chartData: RevenueChartData;
  data: RevenueItem[];
}

export interface RevenueStore {
  allRevenue: RevenueItem[];
  displayedRevenue: RevenueItem[];
  filteredRevenue: RevenueItem[];
  summary: RevenueSummary | null;
  chartData: RevenueChartData | null;
  meta: RevenueMeta | null;
  isInitialLoading: boolean;
  isPaginating: boolean;
  isDeleting: boolean;
  error: string | null;
  searchQuery: string;
  displayCount: number;
  sourceFilter: RevenueSourceType | 'ALL';
  dateFilter: {
    start: any;
    end: any;
  } | null;
  lastFetchTime: number | null;

  // Actions
  fetchRevenue: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchRevenue: (query: string) => void;
  setSourceFilter: (source: RevenueSourceType | 'ALL') => void;
  setDateFilter: (dateRange: { start: any; end: any } | null) => void;
  applyFilters: () => void;
  deleteRevenue: (
    id: string,
    sourceType: RevenueSourceType,
    sourceId: string
  ) => Promise<void>;
  clearSearch: () => void;
  refreshRevenue: () => Promise<void>;
  reset: () => void;
}
