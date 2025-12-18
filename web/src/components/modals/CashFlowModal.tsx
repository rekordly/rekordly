'use client';

import React from 'react';
import Link from 'next/link';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
  Divider,
  Chip,
} from '@heroui/react';
import {
  X,
  Calendar,
  CreditCard,
  Tag,
  User,
  FileText,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { CashFlowItem } from '@/types/cashflow';
import { formatCurrency, formatDate } from '@/lib/fn';

interface CashFlowModalProps {
  item: CashFlowItem | null;
  isOpen: boolean;
  onClose: () => void;
}

const getRouteForSource = (
  sourceType: string,
  sourceNumber?: string,
  sourceId?: string
) => {
  const routes: Record<string, { path: string; label: string }> = {
    SALE: {
      path: `/dashboard/sales/${sourceNumber}`,
      label: 'View Sale Details',
    },
    QUOTATION: {
      path: `/dashboard/quotations/${sourceNumber}`,
      label: 'View Quotation Details',
    },
    PURCHASE: {
      path: `/dashboard/purchases/${sourceNumber}`,
      label: 'View Purchase Details',
    },
    FIXED_ASSET_PURCHASE: {
      path: `/dashboard/assets/${sourceId}`,
      label: 'View Asset Details',
    },
    FIXED_ASSET_SALE: {
      path: `/dashboard/assets/${sourceId}`,
      label: 'View Asset Details',
    },
    LOAN_RECEIVABLE: {
      path: `/dashboard/loans/${sourceId}`,
      label: 'View Loan Details',
    },
    LOAN_PAYABLE: {
      path: `/dashboard/loans/${sourceId}`,
      label: 'View Loan Details',
    },
  };

  return routes[sourceType] || null;
};

const getPaymentMethodLabel = (method: string) => {
  const methods: Record<string, string> = {
    BANK_TRANSFER: 'Bank Transfer',
    CASH: 'Cash',
    CARD: 'Card',
    MOBILE_MONEY: 'Mobile Money',
    CHEQUE: 'Cheque',
    OTHER: 'Other',
  };
  return methods[method] || method;
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

export function CashFlowModal({ item, isOpen, onClose }: CashFlowModalProps) {
  if (!item) return null;

  const isInflow = item.flowType === 'INFLOW';
  const FlowIcon = isInflow ? ArrowUpRight : ArrowDownRight;
  const route = getRouteForSource(
    item.sourceType,
    item.sourceNumber,
    item.sourceId
  );

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      size="lg"
      onClose={onClose}
      classNames={{
        base: 'max-h-[90vh]',
        body: 'py-6',
      }}
    >
      <ModalContent>
        {onClose => (
          <>
            {/* Header */}
            <ModalHeader className="flex items-center justify-between pb-4 border-b border-divider">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Chip
                    className="h-6"
                    color={getCategoryBadgeColor(item.flowCategory) as any}
                    size="sm"
                    variant="flat"
                  >
                    <span className="text-xs font-medium">
                      {item.flowCategory}
                    </span>
                  </Chip>

                  <div className="flex items-center gap-1">
                    <FlowIcon
                      size={16}
                      className={
                        isInflow ? 'text-success-500' : 'text-danger-500'
                      }
                    />
                    <span
                      className={`text-xs font-medium ${isInflow ? 'text-success-600' : 'text-danger-600'}`}
                    >
                      {isInflow ? 'CASH INFLOW' : 'CASH OUTFLOW'}
                    </span>
                  </div>
                </div>
                <h3 className="text-lg font-semibold">{item.description}</h3>
                {item.sourceNumber && (
                  <p className="text-sm text-default-500 font-normal mt-0.5">
                    {item.sourceNumber}
                  </p>
                )}
              </div>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={onClose}
                className="min-w-unit-8 w-unit-8 h-unit-8"
              >
                <X size={18} />
              </Button>
            </ModalHeader>

            <ModalBody>
              {/* Amount */}
              <div className="mb-6">
                <p className="text-sm text-default-500 mb-1">Amount</p>
                <p
                  className={`text-3xl font-bold ${isInflow ? 'text-success-600' : 'text-danger-600'}`}
                >
                  {isInflow ? '+' : '-'}
                  {formatCurrency(Math.abs(item.amount))}
                </p>
              </div>

              <Divider className="my-4" />

              {/* Details Grid */}
              <div className="space-y-4">
                {/* Date */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                    <Calendar size={18} className="text-default-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-default-500">Date</p>
                    <p className="text-sm font-medium">
                      {formatDate(item.date)}
                    </p>
                  </div>
                </div>

                {/* Payment Method */}
                {item.paymentMethod && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <CreditCard size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Payment Method</p>
                      <p className="text-sm font-medium">
                        {getPaymentMethodLabel(item.paymentMethod)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Sub Category */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                    <Tag size={18} className="text-default-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-default-500">Type</p>
                    <p className="text-sm font-medium">
                      {item.subCategory.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>

                {/* Customer Name */}
                {item.customerName && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <User size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Customer</p>
                      <p className="text-sm font-medium">{item.customerName}</p>
                    </div>
                  </div>
                )}

                {/* Vendor Name */}
                {item.vendorName && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <User size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Vendor</p>
                      <p className="text-sm font-medium">{item.vendorName}</p>
                    </div>
                  </div>
                )}

                {/* Shareholder Name */}
                {item.shareholderName && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <User size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Shareholder</p>
                      <p className="text-sm font-medium">
                        {item.shareholderName}
                      </p>
                    </div>
                  </div>
                )}

                {/* Loan Number */}
                {item.loanNumber && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Loan Number</p>
                      <p className="text-sm font-medium">{item.loanNumber}</p>
                    </div>
                  </div>
                )}

                {/* Reference */}
                {item.reference && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Tag size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Reference</p>
                      <p className="text-sm font-medium break-all">
                        {item.reference}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Capital Gain (for asset sales) */}
              {item.capitalGain !== undefined && item.capitalGain !== null && (
                <>
                  <Divider className="my-4" />
                  <div className="bg-default-50 dark:bg-default-100/50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {item.capitalGain >= 0 ? (
                          <TrendingUp size={16} className="text-success-500" />
                        ) : (
                          <TrendingDown size={16} className="text-danger-500" />
                        )}
                        <p className="text-sm text-default-600">
                          Capital Gain/Loss
                        </p>
                      </div>
                      <p
                        className={`text-sm font-semibold ${item.capitalGain >= 0 ? 'text-success-600' : 'text-danger-600'}`}
                      >
                        {formatCurrency(item.capitalGain)}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              {item.notes && (
                <>
                  <Divider className="my-4" />
                  <div>
                    <p className="text-xs text-default-500 mb-2">Notes</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {item.notes}
                    </p>
                  </div>
                </>
              )}

              {/* Link to Source */}
              {route && (
                <>
                  <Divider className="my-4" />
                  <Link
                    href={route.path}
                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                  >
                    <ExternalLink size={16} />
                    <span className="text-sm font-medium">{route.label}</span>
                  </Link>
                </>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
