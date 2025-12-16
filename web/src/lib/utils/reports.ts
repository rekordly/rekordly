import { toTwoDecimals } from '@/lib/fn';

export function getDateRange(
  range: string,
  customStart?: string,
  customEnd?: string
): { startDate: Date; endDate: Date } {
  const now = new Date();
  let startDate: Date;
  let endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );

  if (range === 'custom' && customStart && customEnd) {
    startDate = new Date(customStart);
    endDate = new Date(customEnd);
    endDate.setHours(23, 59, 59, 999);
  } else {
    switch (range) {
      case 'today':
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0
        );
        break;
      case 'thisWeek':
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'past3Months':
        startDate = new Date(
          now.getFullYear(),
          now.getMonth() - 3,
          1,
          0,
          0,
          0,
          0
        );
        break;
      case 'past6Months':
        startDate = new Date(
          now.getFullYear(),
          now.getMonth() - 6,
          1,
          0,
          0,
          0,
          0
        );
        break;
      case 'thisYear':
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      case 'lastYear':
        startDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      case 'all':
        startDate = new Date(2000, 0, 1, 0, 0, 0, 0);
        break;
      default:
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    }
  }

  return { startDate, endDate };
}

export function calculateMonthlyData(
  payments: Array<{ paymentDate: Date; amount: number }>,
  startDate: Date,
  endDate: Date
) {
  const monthMap = new Map<string, { amount: number; count: number }>();

  payments.forEach(payment => {
    const date = new Date(payment.paymentDate);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const existing = monthMap.get(monthKey) || { amount: 0, count: 0 };
    monthMap.set(monthKey, {
      amount: existing.amount + payment.amount,
      count: existing.count + 1,
    });
  });

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const [year, month] = key.split('-');
      const monthName = new Date(
        parseInt(year),
        parseInt(month) - 1
      ).toLocaleString('default', {
        month: 'short',
      });

      return {
        month: monthName,
        amount: toTwoDecimals(value.amount),
        count: value.count,
      };
    });
}

export function getMonthCount(startDate: Date, endDate: Date): number {
  const months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth()) +
    1;
  return Math.max(1, months);
}

// Format PayableType for display
export function formatSourceName(source: string): string {
  const names: Record<string, string> = {
    SALE: 'Sales',
    QUOTATION: 'Quotations',
    OTHER_INCOME: 'Other Income',
    PURCHASE: 'Purchases',
    OTHER_EXPENSES: 'Other Expenses',
  };
  return names[source] || source;
}

export function formatCategoryName(category: string): string {
  return category
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

export function isDeductibleCategory(category: string): boolean {
  const nonDeductible = [
    'FINES_PENALTIES',
    'BENEFITS_IN_KIND',
    'NON_APPROVED_PENSION',
    'PERSONAL_LIVING_EXPENSES',
    'PERSONAL_EXPENSES',
  ];
  return !nonDeductible.includes(category);
}

// Calculate days between two dates
export function getDaysDifference(startDate: Date, endDate: Date): number {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Determine aging category
export function getAgingCategory(daysOutstanding: number): string {
  if (daysOutstanding <= 30) return '0-30 days';
  if (daysOutstanding <= 60) return '30-60 days';
  if (daysOutstanding <= 90) return '60-90 days';
  return '90+ days';
}
