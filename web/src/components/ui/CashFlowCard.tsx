'use client';

import Link from 'next/link';
import {
  ShoppingCart,
  DollarSign,
  RefreshCw,
  FileText,
  Package,
  Building2,
  Banknote,
  TrendingUp,
  TrendingDown,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import { Chip, Tooltip } from '@heroui/react';
import { CashFlowItem } from '@/types/cashflow';
import { formatCurrency, formatDate } from '@/lib/fn';

interface CashFlowCardProps {
  item: CashFlowItem;
  onClick: (item: CashFlowItem) => void;
}

const getSourceConfig = (sourceType: string, flowType: string) => {
  const isInflow = flowType === 'INFLOW';

  switch (sourceType) {
    case 'SALE':
      return {
        icon: ShoppingCart,
        chipColor: 'success' as const,
        label: 'Sale Payment',
        bgColor: 'bg-success-50 dark:bg-success-900/20',
        iconColor: 'text-success-600 dark:text-success-400',
      };
    case 'QUOTATION':
      return {
        icon: FileText,
        chipColor: 'primary' as const,
        label: 'Quotation Payment',
        bgColor: 'bg-primary-50 dark:bg-primary-900/20',
        iconColor: 'text-primary-600 dark:text-primary-400',
      };
    case 'OTHER_INCOME':
      return {
        icon: DollarSign,
        chipColor: 'success' as const,
        label: 'Other Income',
        bgColor: 'bg-success-50 dark:bg-success-900/20',
        iconColor: 'text-success-600 dark:text-success-400',
      };
    case 'PURCHASE':
      return {
        icon: Package,
        chipColor: 'danger' as const,
        label: 'Purchase Payment',
        bgColor: 'bg-danger-50 dark:bg-danger-900/20',
        iconColor: 'text-danger-600 dark:text-danger-400',
      };
    case 'EXPENSE':
      return {
        icon: Receipt,
        chipColor: 'warning' as const,
        label: 'Expense Payment',
        bgColor: 'bg-warning-50 dark:bg-warning-900/20',
        iconColor: 'text-warning-600 dark:text-warning-400',
      };
    case 'SALE_REFUND':
      return {
        icon: RefreshCw,
        chipColor: 'warning' as const,
        label: 'Sale Refund',
        bgColor: 'bg-warning-50 dark:bg-warning-900/20',
        iconColor: 'text-warning-600 dark:text-warning-400',
      };
    case 'QUOTATION_REFUND':
      return {
        icon: RefreshCw,
        chipColor: 'primary' as const,
        label: 'Quotation Refund',
        bgColor: 'bg-primary-50 dark:bg-primary-900/20',
        iconColor: 'text-primary-600 dark:text-primary-400',
      };
    case 'PURCHASE_RETURN':
      return {
        icon: RefreshCw,
        chipColor: 'success' as const,
        label: 'Purchase Return',
        bgColor: 'bg-success-50 dark:bg-success-900/20',
        iconColor: 'text-success-600 dark:text-success-400',
      };
    case 'EXPENSE_RETURN':
      return {
        icon: RefreshCw,
        chipColor: 'success' as const,
        label: 'Expense Return',
        bgColor: 'bg-success-50 dark:bg-success-900/20',
        iconColor: 'text-success-600 dark:text-success-400',
      };
    case 'FIXED_ASSET_PURCHASE':
      return {
        icon: Building2,
        chipColor: 'secondary' as const,
        label: 'Asset Purchase',
        bgColor: 'bg-secondary-50 dark:bg-secondary-900/20',
        iconColor: 'text-secondary-600 dark:text-secondary-400',
      };
    case 'FIXED_ASSET_SALE':
      return {
        icon: Building2,
        chipColor: 'success' as const,
        label: 'Asset Sale',
        bgColor: 'bg-success-50 dark:bg-success-900/20',
        iconColor: 'text-success-600 dark:text-success-400',
      };
    case 'LOAN_RECEIVABLE':
      return {
        icon: Banknote,
        chipColor: 'success' as const,
        label: 'Loan Repayment Received',
        bgColor: 'bg-success-50 dark:bg-success-900/20',
        iconColor: 'text-success-600 dark:text-success-400',
      };
    case 'LOAN_PAYABLE':
      return {
        icon: Banknote,
        chipColor: 'danger' as const,
        label: 'Loan Repayment Made',
        bgColor: 'bg-danger-50 dark:bg-danger-900/20',
        iconColor: 'text-danger-600 dark:text-danger-400',
      };
    case 'CAPITAL_INJECTION':
      return {
        icon: TrendingUp,
        chipColor: 'success' as const,
        label: 'Capital Injection',
        bgColor: 'bg-success-50 dark:bg-success-900/20',
        iconColor: 'text-success-600 dark:text-success-400',
      };
    case 'OWNER_DRAWING':
      return {
        icon: TrendingDown,
        chipColor: 'warning' as const,
        label: 'Owner Drawing',
        bgColor: 'bg-warning-50 dark:bg-warning-900/20',
        iconColor: 'text-warning-600 dark:text-warning-400',
      };
    case 'DIVIDEND':
      return {
        icon: DollarSign,
        chipColor: 'primary' as const,
        label: 'Dividend',
        bgColor: 'bg-primary-50 dark:bg-primary-900/20',
        iconColor: 'text-primary-600 dark:text-primary-400',
      };
    default:
      return {
        icon: DollarSign,
        chipColor: 'default' as const,
        label: 'Transaction',
        bgColor: 'bg-default-50 dark:bg-default-900/20',
        iconColor: 'text-default-600 dark:text-default-400',
      };
  }
};

const getRouteForSource = (
  sourceType: string,
  sourceNumber?: string,
  sourceId?: string
) => {
  const routes: Record<string, string> = {
    SALE: `/dashboard/sales/${sourceNumber}`,
    QUOTATION: `/dashboard/quotations/${sourceNumber}`,
    PURCHASE: `/dashboard/purchases/${sourceNumber}`,
    FIXED_ASSET_PURCHASE: `/dashboard/assets/${sourceId}`,
    FIXED_ASSET_SALE: `/dashboard/assets/${sourceId}`,
    LOAN_RECEIVABLE: `/dashboard/loans/${sourceId}`,
    LOAN_PAYABLE: `/dashboard/loans/${sourceId}`,
  };

  return routes[sourceType] || null;
};

const getCategoryBadgeColor = (category: string) => {
  switch (category) {
    case 'OPERATING':
      return 'primary';
    case 'INVESTING':
      return 'secondary';
    case 'FINANCING':
      return 'warning';
    default:
      return 'default';
  }
};

export function CashFlowCard({ item, onClick }: CashFlowCardProps) {
  const config = getSourceConfig(item.sourceType, item.flowType);
  const Icon = config.icon;
  const isInflow = item.flowType === 'INFLOW';
  const FlowIcon = isInflow ? ArrowUpRight : ArrowDownRight;
  const route = getRouteForSource(
    item.sourceType,
    item.sourceNumber,
    item.sourceId
  );

  const handleCardClick = () => {
    onClick(item);
  };

  return (
    <div
      className="group relative bg-white dark:bg-[#010601] dark:border-primary/20 dark:border rounded-2xl p-4 mb-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-transparent hover:border-primary/20"
      onClick={handleCardClick}
    >
      {/* Top Row: Icon, Category Badge & Flow Indicator */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center shrink-0`}
        >
          <Icon size={18} className={config.iconColor} />
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Chip
              className="h-5"
              color={getCategoryBadgeColor(item.flowCategory) as any}
              size="sm"
              variant="flat"
            >
              <span className="text-[0.65rem] font-medium">
                {item.flowCategory}
              </span>
            </Chip>

            <div className="flex items-center gap-1">
              <FlowIcon
                size={14}
                className={isInflow ? 'text-success-500' : 'text-danger-500'}
              />
              <span
                className={`text-[0.65rem] font-medium ${isInflow ? 'text-success-600' : 'text-danger-600'}`}
              >
                {isInflow ? 'INFLOW' : 'OUTFLOW'}
              </span>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
            {item.description}
          </h3>
        </div>
      </div>

      {/* Amount & Source Type Row */}
      <div className="flex items-center justify-between mb-3">
        <p
          className={`text-lg font-bold ${isInflow ? 'text-success-600' : 'text-danger-600'}`}
        >
          {isInflow ? '+' : '-'}
          {formatCurrency(Math.abs(item.amount))}
        </p>

        <Chip
          className="h-6 shrink-0"
          color={config.chipColor}
          size="sm"
          variant="flat"
        >
          <span className="text-[0.65rem] font-medium">{config.label}</span>
        </Chip>
      </div>

      {/* Footer Row: Details & Date */}
      <div className="flex items-center justify-between pt-3 border-t border-divider">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {/* Customer/Vendor/Shareholder Name */}
          {(item.customerName || item.vendorName || item.shareholderName) && (
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                {item.customerName
                  ? 'Customer'
                  : item.vendorName
                    ? 'Vendor'
                    : 'Shareholder'}
              </p>
              <p className="text-xs font-medium text-default-700 truncate">
                {item.customerName || item.vendorName || item.shareholderName}
              </p>
            </div>
          )}

          {/* Payment Method */}
          {item.paymentMethod && (
            <div className="flex flex-col gap-0.5 shrink-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                Method
              </p>
              <p className="text-xs font-medium text-default-700">
                {item.paymentMethod.replace(/_/g, ' ')}
              </p>
            </div>
          )}

          {/* Date */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
              Date
            </p>
            <p className="text-xs font-medium text-default-700 whitespace-nowrap">
              {formatDate(item.date)}
            </p>
          </div>
        </div>

        {/* Link to Source (if available) */}
        {route && (
          <Tooltip content="View details" size="sm">
            <Link
              href={route}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-primary text-xs font-medium hover:underline shrink-0 ml-2"
            >
              <ExternalLink size={14} />
            </Link>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
