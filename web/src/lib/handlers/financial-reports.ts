// lib/handlers/financial-reports.ts
import { prisma } from '@/lib/prisma';
import { toTwoDecimals } from '@/lib/fn';

// ============================================
// REVENUE CALCULATION
// ============================================

export async function calculateRevenue(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  // Fetch all sales
  const sales = await prisma.sale.findMany({
    where: {
      userId,
      saleDate: { gte: startDate, lte: endDate },
      status: {
        in: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED'],
      },
    },
    include: {
      payments: {
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          reference: true,
          notes: true,
        },
      },
      customer: true,
      saleItems: true,
    },
    orderBy: { saleDate: 'desc' },
  });

  // Fetch all quotations
  const quotations = await prisma.quotation.findMany({
    where: {
      userId,
      issueDate: { gte: startDate, lte: endDate },
      status: {
        in: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED'],
      },
    },
    include: {
      payments: {
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          reference: true,
          notes: true,
        },
      },
      customer: true,
    },
    orderBy: { issueDate: 'desc' },
  });

  // Fetch other income with payment tracking
  const otherIncomes = await prisma.incomeRecord.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
      isRefund: false,
    },
    include: {
      payments: {
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          reference: true,
          notes: true,
        },
      },
    },
    orderBy: { date: 'desc' },
  });

  // Calculate sales revenue
  let salesRevenue = 0;
  let salesRefunds = 0;
  let salesCashCollected = 0;
  let salesOutstanding = 0;

  sales.forEach(sale => {
    salesRevenue += sale.totalAmount;
    salesRefunds += sale.refundAmount || 0;
    salesCashCollected += sale.amountPaid;
    salesOutstanding += sale.balance;
  });

  // Calculate quotation revenue
  let quotationRevenue = 0;
  let quotationRefunds = 0;
  let quotationCashCollected = 0;
  let quotationOutstanding = 0;

  quotations.forEach(quotation => {
    quotationRevenue += quotation.totalAmount;
    quotationRefunds += quotation.refundAmount || 0;
    quotationCashCollected += quotation.amountPaid;
    quotationOutstanding += quotation.balance;
  });

  // Calculate other income with payment tracking
  let otherIncomeTotal = 0;
  let otherIncomeCashCollected = 0;
  let otherIncomeOutstanding = 0;

  otherIncomes.forEach(income => {
    otherIncomeTotal += income.grossAmount;
    otherIncomeCashCollected += income.amountPaid;
    otherIncomeOutstanding += income.balance;
  });

  // Totals
  const totalRevenueAccrual = toTwoDecimals(
    salesRevenue + quotationRevenue + otherIncomeTotal
  );
  const totalRefunds = toTwoDecimals(salesRefunds + quotationRefunds);
  const netRevenueAccrual = toTwoDecimals(totalRevenueAccrual - totalRefunds);

  const totalCashCollected = toTwoDecimals(
    salesCashCollected + quotationCashCollected + otherIncomeCashCollected
  );
  const totalOutstanding = toTwoDecimals(
    salesOutstanding + quotationOutstanding + otherIncomeOutstanding
  );

  return {
    // Breakdown by source
    bySource: {
      sales: {
        revenue: toTwoDecimals(salesRevenue),
        refunds: toTwoDecimals(salesRefunds),
        netRevenue: toTwoDecimals(salesRevenue - salesRefunds),
        cashCollected: toTwoDecimals(salesCashCollected),
        outstanding: toTwoDecimals(salesOutstanding),
      },
      quotations: {
        revenue: toTwoDecimals(quotationRevenue),
        refunds: toTwoDecimals(quotationRefunds),
        netRevenue: toTwoDecimals(quotationRevenue - quotationRefunds),
        cashCollected: toTwoDecimals(quotationCashCollected),
        outstanding: toTwoDecimals(quotationOutstanding),
      },
      otherIncome: {
        revenue: toTwoDecimals(otherIncomeTotal),
        cashCollected: toTwoDecimals(otherIncomeCashCollected),
        outstanding: toTwoDecimals(otherIncomeOutstanding),
      },
    },

    // Summary totals
    summary: {
      totalRevenueAccrual,
      totalRefunds,
      netRevenueAccrual,
      totalCashCollected,
      totalOutstanding,
    },

    // Raw data for detailed reports
    rawData: {
      sales,
      quotations,
      otherIncomes,
    },
  };
}

// ============================================
// EXPENSE CALCULATION (Detailed Breakdown)
// ============================================

export async function calculateExpenses(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  // Fetch all purchases with payment tracking
  const purchases = await prisma.purchase.findMany({
    where: {
      userId,
      purchaseDate: { gte: startDate, lte: endDate },
    },
    include: {
      payments: {
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          reference: true,
          notes: true,
        },
      },
      customer: true,
      items: true,
    },
    orderBy: { purchaseDate: 'desc' },
  });

  // Fetch all expenses with payment tracking
  const expenses = await prisma.expense.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
      isReturn: false,
    },
    include: {
      payments: {
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          reference: true,
          notes: true,
        },
      },
    },
    orderBy: { date: 'desc' },
  });

  // Calculate purchase totals
  let purchaseTotal = 0;
  let purchaseRefunds = 0;
  let purchaseCashPaid = 0;
  let purchaseOutstanding = 0;

  const purchasesByType: Record<string, number> = {};

  purchases.forEach(purchase => {
    const netAmount = purchase.totalAmount - (purchase.refundAmount || 0);
    purchaseTotal += purchase.totalAmount;
    purchaseRefunds += purchase.refundAmount || 0;
    purchaseCashPaid += purchase.amountPaid;
    purchaseOutstanding += purchase.balance;

    // Group by purchase type
    const type = purchase.purchaseType;
    purchasesByType[type] = toTwoDecimals(
      (purchasesByType[type] || 0) + netAmount
    );
  });

  // Calculate expense totals with payment tracking
  let expenseTotal = 0;
  let expenseCashPaid = 0;
  let expenseOutstanding = 0;
  let deductibleExpenses = 0;
  let nonDeductibleExpenses = 0;

  const expensesByCategory: Record<string, number> = {};

  expenses.forEach(expense => {
    expenseTotal += expense.amount;
    expenseCashPaid += expense.amountPaid;
    expenseOutstanding += expense.balance;

    // Deductible calculation
    if (expense.isDeductible) {
      const deductible = (expense.amount * expense.deductionPercentage) / 100;
      deductibleExpenses += deductible;
      nonDeductibleExpenses += expense.amount - deductible;
    } else {
      nonDeductibleExpenses += expense.amount;
    }

    // Group by category
    const category = expense.category;
    expensesByCategory[category] = toTwoDecimals(
      (expensesByCategory[category] || 0) + expense.amount
    );
  });

  // Totals
  const totalExpensesAccrual = toTwoDecimals(
    purchaseTotal + expenseTotal - purchaseRefunds
  );
  const totalCashPaid = toTwoDecimals(purchaseCashPaid + expenseCashPaid);
  const totalOutstanding = toTwoDecimals(
    purchaseOutstanding + expenseOutstanding
  );

  return {
    summary: {
      totalExpensesAccrual,
      totalRefunds: toTwoDecimals(purchaseRefunds),
      netExpensesAccrual: toTwoDecimals(
        purchaseTotal + expenseTotal - purchaseRefunds
      ),
      totalCashPaid,
      totalOutstanding,
      deductibleExpenses: toTwoDecimals(deductibleExpenses),
      nonDeductibleExpenses: toTwoDecimals(nonDeductibleExpenses),
    },

    byType: {
      purchases: {
        total: toTwoDecimals(purchaseTotal),
        refunds: toTwoDecimals(purchaseRefunds),
        net: toTwoDecimals(purchaseTotal - purchaseRefunds),
        cashPaid: toTwoDecimals(purchaseCashPaid),
        outstanding: toTwoDecimals(purchaseOutstanding),
        breakdown: purchasesByType,
      },
      expenses: {
        total: toTwoDecimals(expenseTotal),
        cashPaid: toTwoDecimals(expenseCashPaid),
        outstanding: toTwoDecimals(expenseOutstanding),
        breakdown: expensesByCategory,
      },
    },

    rawData: {
      purchases,
      expenses,
    },
  };
}

// ============================================
// INCOME CALCULATION (Revenue - ALL Expenses)
// ============================================

export async function calculateIncome(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  // Get revenue first
  const revenueData = await calculateRevenue(userId, startDate, endDate);

  // Get all sales with their costs
  const sales = revenueData.rawData.sales;

  // Calculate Cost of Goods Sold (COGS) from sales
  let totalCOGS = 0;
  let totalDiscounts = 0;
  let totalDeliveryCosts = 0;
  let totalOtherSaleExpenses = 0;

  sales.forEach(sale => {
    // COGS from sale items
    const cogs = sale.saleItems.reduce((sum, item) => sum + item.totalCost, 0);
    totalCOGS += cogs;

    // Discounts
    totalDiscounts += sale.discountAmount || 0;

    // Delivery costs
    totalDeliveryCosts += sale.deliveryCost || 0;

    // Other sale expenses (from JSON field)
    if (sale.otherSaleExpenses) {
      totalOtherSaleExpenses += sale.totalSaleExpenses || 0;
    }
  });

  // Fetch all purchases (for COGS if not tracked in sales)
  const purchases = await prisma.purchase.findMany({
    where: {
      userId,
      purchaseDate: { gte: startDate, lte: endDate },
      purchaseType: 'INVENTORY_RESTOCK',
    },
  });

  let purchaseCosts = 0;
  let purchaseRefunds = 0;

  purchases.forEach(purchase => {
    purchaseCosts += purchase.totalAmount;
    purchaseRefunds += purchase.refundAmount || 0;
  });

  // Fetch all other expenses
  const expenses = await prisma.expense.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
      isReturn: false,
    },
  });

  let operatingExpenses = 0;
  expenses.forEach(expense => {
    operatingExpenses += expense.amount;
  });

  // Also get business expense purchases
  const businessExpensePurchases = await prisma.purchase.findMany({
    where: {
      userId,
      purchaseDate: { gte: startDate, lte: endDate },
      purchaseType: 'BUSINESS_EXPENSE',
    },
  });

  businessExpensePurchases.forEach(purchase => {
    operatingExpenses += purchase.totalAmount - (purchase.refundAmount || 0);
  });

  // Calculate totals
  const netPurchaseCosts = toTwoDecimals(purchaseCosts - purchaseRefunds);

  // Total COGS = COGS from sales + Net purchases (if applicable)
  const totalCOGSAccrual = toTwoDecimals(totalCOGS + netPurchaseCosts);

  const totalDirectCosts = toTwoDecimals(
    totalCOGSAccrual +
      totalDiscounts +
      totalDeliveryCosts +
      totalOtherSaleExpenses
  );

  const totalOperatingExpenses = toTwoDecimals(operatingExpenses);

  // INCOME CALCULATION (Accrual Basis)
  const grossProfit = toTwoDecimals(
    revenueData.summary.netRevenueAccrual - totalDirectCosts
  );

  const netIncomeAccrual = toTwoDecimals(grossProfit - totalOperatingExpenses);

  // INCOME CALCULATION (Cash Basis)
  const netIncomeCash = toTwoDecimals(
    revenueData.summary.totalCashCollected -
      totalDirectCosts -
      totalOperatingExpenses
  );

  return {
    revenue: {
      accrual: revenueData.summary.netRevenueAccrual,
      cash: revenueData.summary.totalCashCollected,
      bySource: revenueData.bySource,
    },

    directCosts: {
      cogs: toTwoDecimals(totalCOGSAccrual),
      discounts: toTwoDecimals(totalDiscounts),
      deliveryCosts: toTwoDecimals(totalDeliveryCosts),
      otherSaleExpenses: toTwoDecimals(totalOtherSaleExpenses),
      total: totalDirectCosts,
    },

    grossProfit: {
      accrual: grossProfit,
      cash: toTwoDecimals(
        revenueData.summary.totalCashCollected - totalDirectCosts
      ),
    },

    operatingExpenses: {
      total: totalOperatingExpenses,
    },

    netIncome: {
      accrual: netIncomeAccrual,
      cash: netIncomeCash,
    },

    // Raw data for breakdown
    rawData: {
      sales,
      purchases,
      expenses,
    },
  };
}
