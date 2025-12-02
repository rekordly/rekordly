// types/customer.ts

export type CustomerRole = 'BUYER' | 'SUPPLIER';

export type CustomerType = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  customerRole: CustomerRole;
  createdAt: Date | string;
  updatedAt: Date | string;

  // Stats
  _count?: {
    invoices: number;
    sales: number;
    purchases: number;
  };

  // Financial stats
  totalSpent?: number;
  totalOwed?: number;
  totalRevenue?: number; // For suppliers (what they've earned from us)
  totalDebt?: number; // For suppliers (what we owe them)
};

export type CustomerStats = {
  totalCustomers: number;
  totalBuyers: number;
  totalSuppliers: number;
  totalDebtors: number;
  totalCreditors: number;
  totalDebtAmount: number;
  totalCreditAmount: number;
};

export type CustomerWithDetails = CustomerType & {
  salesHistory?: {
    id: string;
    receiptNumber: string;
    totalAmount: number;
    amountPaid: number;
    balance: number;
    status: string;
    saleDate: Date | string;
  }[];
  purchaseHistory?: {
    id: string;
    purchaseNumber: string;
    totalAmount: number;
    amountPaid: number;
    balance: number;
    status: string;
    purchaseDate: Date | string;
  }[];
};
