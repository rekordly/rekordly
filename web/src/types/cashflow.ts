import { PaymentMethod } from '@/types/index';

export type CashFlowType = 'INFLOW' | 'OUTFLOW';
export type CashFlowCategory = 'OPERATING' | 'INVESTING' | 'FINANCING';

export type CashFlowSourceType =
  | 'SALE'
  | 'QUOTATION'
  | 'OTHER_INCOME'
  | 'PURCHASE'
  | 'EXPENSE'
  | 'SALE_REFUND'
  | 'QUOTATION_REFUND'
  | 'PURCHASE_RETURN'
  | 'EXPENSE_RETURN'
  | 'FIXED_ASSET_PURCHASE'
  | 'FIXED_ASSET_SALE'
  | 'LOAN_RECEIVABLE'
  | 'LOAN_PAYABLE'
  | 'CAPITAL_INJECTION'
  | 'OWNER_DRAWING'
  | 'DIVIDEND';

export interface CashFlowItem {
  id: string;
  date: string;
  amount: number;
  flowType: CashFlowType;
  flowCategory: CashFlowCategory;
  subCategory: string;
  description: string;
  sourceType: CashFlowSourceType;
  sourceId: string;
  paymentMethod: PaymentMethod | null;
  reference: string | null;
  notes: string | null;

  // Optional fields based on source type
  sourceNumber?: string;
  customerName?: string;
  vendorName?: string;
  incomeCategory?: string;
  incomeSubCategory?: string;
  expenseCategory?: string;
  assetCategory?: string;
  capitalGain?: number | null;
  loanNumber?: string;
  shareholderName?: string | null;
}

export interface CashFlowCategorySummary {
  inflows: number;
  outflows: number;
  net: number;
}

export interface CashFlowSummary {
  operating: CashFlowCategorySummary;
  investing: CashFlowCategorySummary;
  financing: CashFlowCategorySummary;
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
  averagePerMonth: number;
  byPaymentMethod: Record<string, number>;
}

export interface CategoryBreakdown {
  name: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashFlowChartData {
  monthly: Array<{
    month: string;
    amount: number;
    count: number;
  }>;
  byCategory: CategoryBreakdown[];
}

export interface CashFlowMeta {
  type: 'cashflow';
  range: string;
  startDate: string;
  endDate: string;
  totalRecords: number;
  registrationType: string;
  includesOwnerEquity: boolean;
  currency: string;
}

export interface CashFlowResponse {
  success: boolean;
  meta: CashFlowMeta;
  summary: CashFlowSummary;
  chartData: CashFlowChartData;
  data: CashFlowItem[];
}

export interface CashFlowStore {
  allCashFlow: CashFlowItem[];
  displayedCashFlow: CashFlowItem[];
  filteredCashFlow: CashFlowItem[];
  summary: CashFlowSummary | null;
  chartData: CashFlowChartData | null;
  meta: CashFlowMeta | null;
  isInitialLoading: boolean;
  isPaginating: boolean;
  error: string | null;
  searchQuery: string;
  displayCount: number;
  categoryFilter: CashFlowCategory | 'ALL';
  flowTypeFilter: CashFlowType | 'ALL';
  sourceTypeFilter: CashFlowSourceType | 'ALL';
  dateFilter: {
    start: any;
    end: any;
  } | null;
  lastFetchTime: number | null;

  // Actions
  fetchCashFlow: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchCashFlow: (query: string) => void;
  setCategoryFilter: (category: CashFlowCategory | 'ALL') => void;
  setFlowTypeFilter: (flowType: CashFlowType | 'ALL') => void;
  setSourceTypeFilter: (sourceType: CashFlowSourceType | 'ALL') => void;
  setDateFilter: (dateRange: { start: any; end: any } | null) => void;
  applyFilters: () => void;
  clearSearch: () => void;
  refreshCashFlow: () => Promise<void>;
  reset: () => void;
}
