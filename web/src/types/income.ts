import { addIncomeSchema } from '@/lib/validations/income';
import z from 'zod';
import { PaymentMethod } from '@/types/index';

export type IncomeSourceType = 'QUOTATION' | 'SALE' | 'OTHER_INCOME';

export type IncomeStatusType =
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'UNPAID';

// ============================================================================
// INCOME RECORD STATUS
// ============================================================================

export enum IncomeRecordStatus {
  UNPAID = 'UNPAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

// ============================================================================
// INCOME LIST TYPES (matching backend /api/income GET response)
// ============================================================================

export interface Income {
  id: string;
  date: string;
  amount: number;

  // Payment tracking fields
  amountPaid: number;
  balance: number;
  status: IncomeRecordStatus;

  paymentMethod: PaymentMethod | 'UNPAID' | 'OTHER';
  reference: string | null;
  notes: string | null;
  sourceType: IncomeSourceType;
  sourceId: string;
  sourceNumber: string | null;
  sourceTitle: string | null;
  sourceDescription: string | null;
  sourceTotalAmount: number;
  sourceAmountPaid: number | null;
  sourceBalance: number | null;
  sourceStatus: IncomeStatusType | null;
  refundAmount: number | null;
  refundDate: string | null;
  refundReason: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  vendorName?: string | null;
  includesVAT: boolean;
  vatAmount: number | null;
  taxablePercentage: number | null;
  hasPayment: boolean;

  // Other income specific fields
  incomeMainCategory?: string;
  incomeSubCategory?: string;
  customSubCategory?: string;

  // Related payments
  payments?: IncomePayment[];
}

export interface IncomePayment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference: string | null;
  notes: string | null;
}

export interface IncomeSummary {
  // Accrual Basis
  grossRevenue: number;
  totalRefunds: number;
  refundsBySource: {
    SALE: number;
    QUOTATION: number;
    OTHER_INCOME: number;
  };
  netIncome: number;

  // Cash Basis
  totalReceived: number;
  outstandingBalance: number;

  // Payment status breakdown
  unpaidAmount: number;
  partiallyPaidAmount: number;
  paidAmount: number;

  // Breakdown
  averagePerMonth: number;
  topSource: string;
  bySource: Record<string, number>;
  byPaymentMethod: Record<string, number>;
  byStatus: Record<IncomeRecordStatus, number>;

  // Detailed breakdown by source type
  breakdown: {
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
      outstanding: number;
    };
  };
}

export interface SourceBreakdown {
  name: string;
  value: number;
  percentage: number;
  refundAmount: number;
}

export interface IncomeChartData {
  monthly: Array<{
    month: string;
    amount: number;
    count: number;
    received: number;
    outstanding: number;
  }>;
  bySource: SourceBreakdown[];
  byStatus: Array<{
    status: IncomeRecordStatus;
    value: number;
    percentage: number;
  }>;
}

export interface IncomeMeta {
  type: 'income';
  range: string;
  startDate: string;
  endDate: string;
  totalRecords: number;
  saleRecords: number;
  quotationRecords: number;
  otherIncomeRecords: number;
  currency: string;
}

export interface IncomeResponse {
  success: boolean;
  meta: IncomeMeta;
  summary: IncomeSummary;
  chartData: IncomeChartData;
  data: Income[];
}

// ============================================================================
// INCOME STATEMENT TYPES (matching backend /api/reports/income-statement)
// ============================================================================

export interface RevenueBreakdown {
  name: string;
  accrual: number;
  cash: number;
}

export interface DirectCosts {
  costOfGoodsSold: number;
  discounts: number;
  deliveryCosts: number;
  otherSaleExpenses: number;
  total: number;
}

export interface GrossProfit {
  accrual: number;
  cash: number;
  marginAccrual: number;
  marginCash: number;
}

export interface OperatingExpenses {
  total: number;
}

export interface NetIncome {
  accrual: number;
  cash: number;
  marginAccrual: number;
  marginCash: number;
  averagePerMonth: {
    accrual: number;
    cash: number;
  };
}

export interface IncomeStatement {
  revenue: {
    breakdown: RevenueBreakdown[];
    total: {
      accrual: number;
      cash: number;
    };
  };
  directCosts: DirectCosts;
  grossProfit: GrossProfit;
  operatingExpenses: OperatingExpenses;
  netIncome: NetIncome;
}

export interface ComparisonChart {
  revenue: {
    accrual: number;
    cash: number;
  };
  directCosts: {
    accrual: number;
    cash: number;
  };
  operatingExpenses: {
    accrual: number;
    cash: number;
  };
  netIncome: {
    accrual: number;
    cash: number;
  };
}

export interface ProfitabilityChart {
  grossProfitMargin: {
    accrual: number;
    cash: number;
  };
  netProfitMargin: {
    accrual: number;
    cash: number;
  };
}

export interface IncomeStatementChartData {
  comparison: ComparisonChart;
  profitability: ProfitabilityChart;
}

export interface IncomeStatementMeta {
  type: 'income-statement';
  range: string;
  startDate: string;
  endDate: string;
  currency: string;
}

export interface IncomeStatementResponse {
  success: boolean;
  meta: IncomeStatementMeta;
  incomeStatement: IncomeStatement;
  chartData: IncomeStatementChartData;
}

// ============================================================================
// STORE INTERFACE
// ============================================================================

export interface IncomeStore {
  // Income list data
  allIncome: Income[];
  displayedIncome: Income[];
  filteredIncome: Income[];
  summary: IncomeSummary | null;
  chartData: IncomeChartData | null;
  meta: IncomeMeta | null;

  // Income statement data
  incomeStatement: IncomeStatement | null;
  incomeStatementChartData: IncomeStatementChartData | null;
  incomeStatementMeta: IncomeStatementMeta | null;

  // Loading states
  isInitialLoading: boolean;
  isPaginating: boolean;
  isDeleting: boolean;
  isLoadingStatement: boolean;
  error: string | null;

  // Filters
  searchQuery: string;
  displayCount: number;
  sourceFilter: IncomeSourceType | 'ALL';
  statusFilter: IncomeRecordStatus | 'ALL';
  dateFilter: {
    start: any;
    end: any;
  } | null;

  // Cache tracking
  lastFetchTime: number | null;
  lastStatementFetchTime: number | null;

  // Income list actions
  fetchIncome: (forceRefresh?: boolean) => Promise<void>;
  loadMoreDisplayed: () => void;
  searchIncome: (query: string) => void;
  setSourceFilter: (source: IncomeSourceType | 'ALL') => void;
  setStatusFilter: (status: IncomeRecordStatus | 'ALL') => void;
  setDateFilter: (dateRange: { start: any; end: any } | null) => void;
  applyFilters: () => void;
  deleteIncome: (
    id: string,
    sourceType: IncomeSourceType,
    sourceId: string | null
  ) => Promise<void>;
  clearSearch: () => void;
  refreshIncome: () => Promise<void>;

  // Income statement actions
  fetchIncomeStatement: (forceRefresh?: boolean) => Promise<void>;
  refreshIncomeStatement: () => Promise<void>;

  reset: () => void;
}

// ============================================================================
// INCOME CATEGORIES (Keep existing)
// ============================================================================

export enum IncomeMainCategory {
  BUSINESS_PROFIT = 'BUSINESS_PROFIT',
  EMPLOYMENT_INCOME = 'EMPLOYMENT_INCOME',
  INVESTMENT_INCOME = 'INVESTMENT_INCOME',
  PROPERTY_INCOME = 'PROPERTY_INCOME',
  DIGITAL_ASSETS = 'DIGITAL_ASSETS',
  TRUST_ESTATE_INCOME = 'TRUST_ESTATE_INCOME',
  OTHER_INCOME = 'OTHER_INCOME',
  EXEMPT_INCOME = 'EXEMPT_INCOME',
}

export enum IncomeSubCategory {
  // A. Business/Trade Income
  TRADE_PROFIT = 'TRADE_PROFIT',
  SERVICE_FEES = 'SERVICE_FEES',
  COMMISSION = 'COMMISSION',
  ROYALTIES = 'ROYALTIES',
  RENTAL_INCOME = 'RENTAL_INCOME',
  INTEREST_INCOME = 'INTEREST_INCOME',
  DIVIDENDS = 'DIVIDENDS',
  PRIZES_AWARDS = 'PRIZES_AWARDS',
  REBATES_DISCOUNTS = 'REBATES_DISCOUNTS',
  OTHER_BUSINESS_INCOME = 'OTHER_BUSINESS_INCOME',

  // B. Employment Income
  SALARY = 'SALARY',
  BONUS = 'BONUS',
  ALLOWANCES = 'ALLOWANCES',
  BENEFITS_IN_KIND = 'BENEFITS_IN_KIND',
  PENSION = 'PENSION',
  SEVERANCE = 'SEVERANCE',

  // C. Investment Income
  INVESTMENT_RETURN = 'INVESTMENT_RETURN',
  CAPITAL_GAINS = 'CAPITAL_GAINS',
  STOCK_OPTIONS = 'STOCK_OPTIONS',
  MUTUAL_FUNDS = 'MUTUAL_FUNDS',
  BONDS = 'BONDS',

  // D. Property Income
  PROPERTY_RENTAL = 'PROPERTY_RENTAL',
  PROPERTY_LEASING = 'PROPERTY_LEASING',
  PROPERTY_DISPOSAL = 'PROPERTY_DISPOSAL',

  // E. Digital Assets
  CRYPTOCURRENCY_TRADING = 'CRYPTOCURRENCY_TRADING',
  DIGITAL_ASSET_MINING = 'DIGITAL_ASSET_MINING',
  NFT_SALES = 'NFT_SALES',
  DIGITAL_SERVICES = 'DIGITAL_SERVICES',

  // F. Trust/Estate Income
  TRUST_DISTRIBUTION = 'TRUST_DISTRIBUTION',
  ESTATE_DISTRIBUTION = 'ESTATE_DISTRIBUTION',

  // G. Other Income
  GIFTS_RECEIVED = 'GIFTS_RECEIVED',
  DONATIONS_RECEIVED = 'DONATIONS_RECEIVED',
  GRANTS = 'GRANTS',
  COMPENSATION = 'COMPENSATION',
  INSURANCE_PROCEEDS = 'INSURANCE_PROCEEDS',
  INHERITANCE = 'INHERITANCE',
  CUSTOM = 'CUSTOM',

  // H. Exempt Income
  RETURN_OF_CAPITAL = 'RETURN_OF_CAPITAL',
  SPECIFIC_EXEMPTIONS = 'SPECIFIC_EXEMPTIONS',
}

export type AddIncomeType = z.infer<typeof addIncomeSchema>;

export interface IncomeRecord extends AddIncomeType {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// Keep all existing category configurations and helper functions from document 9
export const incomeCategories = [
  {
    value: IncomeMainCategory.BUSINESS_PROFIT,
    label: 'Business/Trade Income',
    subcategories: [
      { value: IncomeSubCategory.TRADE_PROFIT, label: 'Trade Profit' },
      { value: IncomeSubCategory.SERVICE_FEES, label: 'Service Fees' },
      { value: IncomeSubCategory.COMMISSION, label: 'Commission' },
      { value: IncomeSubCategory.ROYALTIES, label: 'Royalties' },
      { value: IncomeSubCategory.RENTAL_INCOME, label: 'Rental Income' },
      { value: IncomeSubCategory.INTEREST_INCOME, label: 'Interest Income' },
      { value: IncomeSubCategory.DIVIDENDS, label: 'Dividends' },
      { value: IncomeSubCategory.PRIZES_AWARDS, label: 'Prizes & Awards' },
      {
        value: IncomeSubCategory.REBATES_DISCOUNTS,
        label: 'Rebates & Discounts',
      },
      {
        value: IncomeSubCategory.OTHER_BUSINESS_INCOME,
        label: 'Other Business Income',
      },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner'],
    description: 'Income from business operations and trade activities',
    note: 'Fully taxable as business income under Section 4(1)(a) of the Tax Act',
  },
  {
    value: IncomeMainCategory.EMPLOYMENT_INCOME,
    label: 'Employment Income',
    subcategories: [
      { value: IncomeSubCategory.SALARY, label: 'Salary' },
      { value: IncomeSubCategory.BONUS, label: 'Bonus' },
      { value: IncomeSubCategory.ALLOWANCES, label: 'Allowances' },
      { value: IncomeSubCategory.BENEFITS_IN_KIND, label: 'Benefits in Kind' },
      { value: IncomeSubCategory.PENSION, label: 'Pension' },
      { value: IncomeSubCategory.SEVERANCE, label: 'Severance' },
    ],
    taxablePercentage: 100,
    workTypes: ['employed'],
    description: 'Income received from employment',
    note: 'Fully taxable as employment income under Section 4(2) of the Tax Act',
  },
  {
    value: IncomeMainCategory.INVESTMENT_INCOME,
    label: 'Investment Income',
    subcategories: [
      {
        value: IncomeSubCategory.INVESTMENT_RETURN,
        label: 'Investment Return',
      },
      { value: IncomeSubCategory.CAPITAL_GAINS, label: 'Capital Gains' },
      { value: IncomeSubCategory.STOCK_OPTIONS, label: 'Stock Options' },
      { value: IncomeSubCategory.MUTUAL_FUNDS, label: 'Mutual Funds' },
      { value: IncomeSubCategory.BONDS, label: 'Bonds' },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income from investments and financial instruments',
    note: 'Fully taxable as investment income under Section 4(1)(c) and (6) of the Tax Act',
  },
  {
    value: IncomeMainCategory.PROPERTY_INCOME,
    label: 'Property Income',
    subcategories: [
      { value: IncomeSubCategory.PROPERTY_RENTAL, label: 'Property Rental' },
      { value: IncomeSubCategory.PROPERTY_LEASING, label: 'Property Leasing' },
      {
        value: IncomeSubCategory.PROPERTY_DISPOSAL,
        label: 'Property Disposal',
      },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income from property ownership and transactions',
    note: 'Fully taxable as property income under Section 4(1)(b) and (i) of the Tax Act',
  },
  {
    value: IncomeMainCategory.DIGITAL_ASSETS,
    label: 'Digital Assets',
    subcategories: [
      {
        value: IncomeSubCategory.CRYPTOCURRENCY_TRADING,
        label: 'Cryptocurrency Trading',
      },
      {
        value: IncomeSubCategory.DIGITAL_ASSET_MINING,
        label: 'Digital Asset Mining',
      },
      { value: IncomeSubCategory.NFT_SALES, label: 'NFT Sales' },
      { value: IncomeSubCategory.DIGITAL_SERVICES, label: 'Digital Services' },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income from digital assets and virtual transactions',
    note: 'Fully taxable as digital asset income under Section 4(1)(k) of the Tax Act',
  },
  {
    value: IncomeMainCategory.TRUST_ESTATE_INCOME,
    label: 'Trust/Estate Income',
    subcategories: [
      {
        value: IncomeSubCategory.TRUST_DISTRIBUTION,
        label: 'Trust Distribution',
      },
      {
        value: IncomeSubCategory.ESTATE_DISTRIBUTION,
        label: 'Estate Distribution',
      },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income from trusts and estates',
    note: 'Fully taxable as trust/estate income under Section 4(4) of the Tax Act',
  },
  {
    value: IncomeMainCategory.OTHER_INCOME,
    label: 'Other Income',
    subcategories: [
      { value: IncomeSubCategory.GIFTS_RECEIVED, label: 'Gifts Received' },
      {
        value: IncomeSubCategory.DONATIONS_RECEIVED,
        label: 'Donations Received',
      },
      { value: IncomeSubCategory.GRANTS, label: 'Grants' },
      { value: IncomeSubCategory.COMPENSATION, label: 'Compensation' },
      {
        value: IncomeSubCategory.INSURANCE_PROCEEDS,
        label: 'Insurance Proceeds',
      },
      { value: IncomeSubCategory.INHERITANCE, label: 'Inheritance' },
      { value: IncomeSubCategory.CUSTOM, label: 'Custom' },
    ],
    taxablePercentage: 100,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Other types of income not classified elsewhere',
    note: 'The Act does not provide a general exemption for gifts, donations, or inheritance. They are considered taxable under the broad "Other Income" clause in Section 4(5).',
  },
  {
    value: IncomeMainCategory.EXEMPT_INCOME,
    label: 'Exempt / Non-Taxable Income',
    subcategories: [
      {
        value: IncomeSubCategory.RETURN_OF_CAPITAL,
        label: 'Return of Capital',
      },
      {
        value: IncomeSubCategory.SPECIFIC_EXEMPTIONS,
        label: 'Specific Statutory Exemptions',
      },
    ],
    taxablePercentage: 0,
    workTypes: ['self-employed', 'freelancer', 'business-owner', 'employed'],
    description: 'Income that is specifically exempt from taxation',
    note: 'Non-taxable by definition. Return of capital is not income. A loan is a liability. Specific exemptions are granted by other parts of the Tax Act (e.g., for Free Trade Zones).',
  },
];

export function formatIncomeSubCategory(value: string): string {
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function normalizeIncomeSubCategory(
  value: string
): IncomeSubCategory | null {
  const normalizedValue = value.toUpperCase().replace(/\s+/g, '_');

  if (
    Object.values(IncomeSubCategory).includes(
      normalizedValue as IncomeSubCategory
    )
  ) {
    return normalizedValue as IncomeSubCategory;
  }
  return null;
}

export function formatCustomSubCategory(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

export function getWorkTypesForSubCategory(
  mainCategory: IncomeMainCategory,
  subCategory: IncomeSubCategory
): string[] {
  const category = incomeCategories.find(cat => cat.value === mainCategory);
  if (!category) return [];

  return category.workTypes;
}

export function getSubCategoryDetails(
  mainCategory: IncomeMainCategory,
  subCategory: IncomeSubCategory
) {
  const category = incomeCategories.find(cat => cat.value === mainCategory);
  if (!category) return null;

  return {
    taxablePercentage: category.taxablePercentage,
    workTypes: category.workTypes,
    description: category.description,
    note: category.note,
  };
}
