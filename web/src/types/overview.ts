// types/overview.ts

export interface OverviewRevenue {
  accrual: number;
  cash: number;
  outstanding: number;
  bySource: {
    sales: number;
    quotations: number;
    otherIncome: number;
  };
}

export interface OverviewExpenses {
  accrual: number;
  cash: number;
  outstanding: number;
  deductible: number;
  nonDeductible: number;
}

export interface OverviewIncome {
  grossProfit: {
    accrual: number;
    cash: number;
  };
  netIncome: {
    accrual: number;
    cash: number;
  };
  profitMargin: {
    gross: {
      accrual: number;
      cash: number;
    };
    net: {
      accrual: number;
      cash: number;
    };
  };
}

export interface OverviewMetrics {
  averageMonthlyRevenue: {
    accrual: number;
    cash: number;
  };
  averageMonthlyExpense: {
    accrual: number;
    cash: number;
  };
  averageMonthlyProfit: {
    accrual: number;
    cash: number;
  };
  outstandingReceivables: number;
  outstandingPayables: number;
}

export interface FinancialOverview {
  revenue: OverviewRevenue;
  expenses: OverviewExpenses;
  income: OverviewIncome;
  metrics: OverviewMetrics;
}

export interface MonthlyTrendData {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface OverviewBreakdown {
  name: string;
  value: number;
  percentage: number;
}

export interface OverviewProfitability {
  grossProfitMargin: {
    accrual: number;
    cash: number;
  };
  netProfitMargin: {
    accrual: number;
    cash: number;
  };
}

export interface OverviewChartData {
  monthlyTrend: MonthlyTrendData[];
  revenueBreakdown: OverviewBreakdown[];
  expenseBreakdown: OverviewBreakdown[];
  profitability: OverviewProfitability;
}

export interface OverviewMeta {
  type: 'financial-overview';
  range: string;
  startDate: string;
  endDate: string;
  monthCount: number;
  currency: string;
}

export interface OverviewResponse {
  success: boolean;
  meta: OverviewMeta;
  overview: FinancialOverview;
  chartData: OverviewChartData;
}

export interface OverviewStore {
  overview: FinancialOverview | null;
  chartData: OverviewChartData | null;
  meta: OverviewMeta | null;
  isLoading: boolean;
  error: string | null;
  lastFetchTime: number | null;

  // Actions
  fetchOverview: (forceRefresh?: boolean) => Promise<void>;
  refreshOverview: () => Promise<void>;
  reset: () => void;
}
