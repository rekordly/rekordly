import { Sale } from '@/types/sales';

export interface SalesStats {
  // Revenue Stats
  grossRevenue: number;
  totalRefunds: number;
  netRevenue: number;
  outstandingBalance: number;

  // Sales Count Stats
  totalSales: number;
  paidSales: number;
  unpaidSales: number;
  partiallyPaidSales: number;

  // Today's Stats
  todayRevenue: number;
  todaySalesCount: number;
  todayPaidCount: number;

  // Profit & Cost Stats
  totalProfit: number;
  totalCost: number;
  profitMargin: number; // percentage

  // Payment Stats
  totalPaid: number;
  averageSaleValue: number;
  averagePaymentReceived: number;
}

/**
 * Calculate comprehensive statistics from sales data
 */
export const calculateSalesStats = (sales: Sale[]): SalesStats => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats: SalesStats = {
    grossRevenue: 0,
    totalRefunds: 0,
    netRevenue: 0,
    outstandingBalance: 0,
    totalSales: sales.length,
    paidSales: 0,
    unpaidSales: 0,
    partiallyPaidSales: 0,
    todayRevenue: 0,
    todaySalesCount: 0,
    todayPaidCount: 0,
    totalProfit: 0,
    totalCost: 0,
    profitMargin: 0,
    totalPaid: 0,
    averageSaleValue: 0,
    averagePaymentReceived: 0,
  };

  sales.forEach(sale => {
    const saleDate = new Date(sale.saleDate);
    saleDate.setHours(0, 0, 0, 0);
    const isToday = saleDate.getTime() === today.getTime();

    // Revenue calculations
    stats.grossRevenue += sale.totalAmount;
    stats.totalPaid += sale.amountPaid;
    stats.outstandingBalance += sale.balance;

    // Refund calculations
    if (sale.status === 'REFUNDED' && sale.refundAmount) {
      stats.totalRefunds += sale.refundAmount;
    } else if (sale.status === 'PARTIALLY_REFUNDED' && sale.refundAmount) {
      stats.totalRefunds += sale.refundAmount;
    }

    // Status counts
    if (sale.status === 'PAID') {
      stats.paidSales++;
      if (isToday) stats.todayPaidCount++;
    } else if (sale.status === 'UNPAID') {
      stats.unpaidSales++;
    } else if (sale.status === 'PARTIALLY_PAID') {
      stats.partiallyPaidSales++;
    }

    // Today's stats
    if (isToday) {
      stats.todayRevenue += sale.totalAmount;
      stats.todaySalesCount++;
    }

    // Profit & Cost from saleItems
    if (sale.saleItems && sale.saleItems.length > 0) {
      sale.saleItems.forEach(item => {
        stats.totalCost += item.totalCost || 0;
        stats.totalProfit += item.profit || 0;
      });
    }
  });

  // Net revenue after refunds
  stats.netRevenue = stats.grossRevenue - stats.totalRefunds;

  // Calculate averages
  if (stats.totalSales > 0) {
    stats.averageSaleValue = stats.grossRevenue / stats.totalSales;
    stats.averagePaymentReceived = stats.totalPaid / stats.totalSales;
  }

  // Calculate profit margin
  if (stats.grossRevenue > 0) {
    stats.profitMargin = (stats.totalProfit / stats.grossRevenue) * 100;
  }

  return stats;
};

/**
 * Format description for revenue card
 */
export const formatRevenueDescription = (stats: SalesStats): string => {
  const parts: string[] = [];

  parts.push(
    `Your business recorded a gross revenue of ${formatCurrency(stats.grossRevenue)}.`
  );

  if (stats.totalRefunds > 0) {
    parts.push(`After ${formatCurrency(stats.totalRefunds)} in refunds`);
  }

  if (stats.outstandingBalance > 0) {
    parts.push(
      `with ${formatCurrency(stats.outstandingBalance)} still outstanding from customers.`
    );
  } else {
    parts.push('with all payments collected.');
  }

  return parts.join(' ');
};

/**
 * Format description for sales count card
 */
export const formatSalesCountDescription = (stats: SalesStats): string => {
  const parts: string[] = [];

  parts.push(`You have completed ${stats.totalSales} total sales.`);

  if (stats.paidSales > 0) {
    parts.push(`${stats.paidSales} fully paid`);
  }

  if (stats.partiallyPaidSales > 0) {
    parts.push(`${stats.partiallyPaidSales} partially paid`);
  }

  if (stats.unpaidSales > 0) {
    parts.push(`and ${stats.unpaidSales} unpaid.`);
  } else {
    parts.push('with all payments received.');
  }

  return parts.join(', ');
};

/**
 * Format description for profit card
 */
export const formatProfitDescription = (stats: SalesStats): string => {
  if (stats.totalProfit === 0) {
    return 'No profit data available yet. Add cost prices to your items to track profitability.';
  }

  const parts: string[] = [];

  parts.push(
    `Total profit of ${formatCurrency(stats.totalProfit)} from ${formatCurrency(stats.totalCost)} in costs.`
  );

  if (stats.profitMargin > 0) {
    parts.push(`Profit margin: ${stats.profitMargin.toFixed(1)}%.`);
  }

  return parts.join(' ');
};

/**
 * Format description for today's stats
 */
export const formatTodayDescription = (stats: SalesStats): string => {
  if (stats.todaySalesCount === 0) {
    return "No sales recorded today. Start creating sales to see today's performance.";
  }

  const parts: string[] = [];

  parts.push(
    `Today you've made ${stats.todaySalesCount} ${stats.todaySalesCount === 1 ? 'sale' : 'sales'}`
  );
  parts.push(`totaling ${formatCurrency(stats.todayRevenue)}.`);

  if (stats.todayPaidCount > 0) {
    parts.push(
      `${stats.todayPaidCount} ${stats.todayPaidCount === 1 ? 'is' : 'are'} fully paid.`
    );
  }

  return parts.join(' ');
};

// Helper function (you should import this from your utils)
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(amount);
};
