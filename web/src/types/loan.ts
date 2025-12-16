// @/types/loan.ts
import { z } from 'zod';
import {
  addLoanSchema,
  TermUnitSchema,
  termUnitType,
} from '@/lib/validations/loan';
import { PaymentMethod } from '@/types/index';

export type AddLoanType = z.infer<typeof addLoanSchema>;

export type LoanType = 'RECEIVABLE' | 'PAYABLE';

export type PaymentFrequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUALLY'
  | 'ONE_TIME';

export type LoanStatus =
  | 'ACTIVE'
  | 'PAID_OFF'
  | 'DEFAULTED'
  | 'RESTRUCTURED'
  | 'WRITTEN_OFF';

export interface Loan {
  id: string;
  loanNumber: string;
  userId: string;
  loanType: LoanType;

  // Party details (borrower OR lender depending on loan type)
  partyName: string;
  partyEmail: string | null;
  partyPhone: string | null;

  principalAmount: number;
  interestRate: number;

  // Loan charges/fees
  processingFee: number;
  managementFee: number;
  insuranceFee: number;
  otherCharges: number;
  totalCharges: number;

  startDate: string;
  endDate: string | null;
  term: number | null;
  termUnit: termUnitType;
  paymentFrequency: PaymentFrequency;

  currentBalance: number;
  totalPaid: number;
  totalInterestPaid: number;

  status: LoanStatus;
  purpose: string | null;
  collateral: string | null;

  notes: string | null;

  createdAt: string;
  updatedAt: string;

  payments?: {
    id: string;
    purchaseId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    category: 'EXPENSE' | 'INCOME';
    payableType: 'LOAN';
    reference?: string | null;
    notes?: string | null;
  }[];
}

export interface LoanPayment {
  id: string;
  loanId: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
}

export interface LoanSummary {
  totalReceivable: number;
  totalPayable: number;
  activeLoansReceivable: number;
  activeLoansPayable: number;
  totalInterestEarned: number;
  totalInterestPaid: number;
  outstandingReceivable: number;
  outstandingPayable: number;
  netLoanPosition: number;
  byStatus: Record<LoanStatus, number>;
  byFrequency: Record<PaymentFrequency, number>;
}

export interface LoanChartData {
  byType: Array<{
    name: string;
    value: number;
    count: number;
  }>;
  byStatus: Array<{
    name: string;
    value: number;
    count: number;
  }>;
  repaymentTrend: Array<{
    month: string;
    principal: number;
    interest: number;
    total: number;
  }>;
}

export interface LoanMeta {
  type: 'loan';
  totalRecords: number;
  receivableCount: number;
  payableCount: number;
  currency: string;
}

export interface LoanResponse {
  success: boolean;
  meta: LoanMeta;
  summary: LoanSummary;
  chartData: LoanChartData;
  data: Loan[];
}

export interface LoanStore {
  allLoans: Loan[];
  displayedLoans: Loan[];
  filteredLoans: Loan[];
  summary: LoanSummary | null;
  chartData: LoanChartData | null;
  meta: LoanMeta | null;
  isInitialLoading: boolean;
  isPaginating: boolean;
  isDeleting: boolean;
  error: string | null;
  searchQuery: string;
  displayCount: number;
  typeFilter: LoanType | 'ALL';
  statusFilter: LoanStatus | 'ALL';
  lastFetchTime: number | null;

  // Actions
  fetchLoans: (forceRefresh?: boolean) => Promise<void>;
  updateLoan: (loanId: string, UpdatedData: Partial<Loan>) => void;
  addLoan: (loan: Loan) => void;
  loadMoreDisplayed: () => void;
  searchLoans: (query: string) => void;
  setTypeFilter: (type: LoanType | 'ALL') => void;
  setStatusFilter: (status: LoanStatus | 'ALL') => void;
  applyFilters: () => void;
  deleteLoan: (id: string) => Promise<void>;
  clearSearch: () => void;
  refreshLoans: () => Promise<void>;
  reset: () => void;
}
