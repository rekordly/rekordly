'use client';

import React from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Chip,
} from '@heroui/react';
import {
  DollarSign,
  Calendar,
  CreditCard,
  FileText,
  Tag,
  User,
  Wallet,
  CheckCircle,
  AlertCircle,
  Trash2,
  Edit,
} from 'lucide-react';
import { Income, IncomeRecordStatus } from '@/types/income';
import { formatCurrency, formatDate } from '@/lib/fn';
import { Divider } from '@heroui/divider';
import { Receipt } from '@phosphor-icons/react';

interface OtherIncomeModalProps {
  income: Income | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (income: Income) => void;
  onDelete?: (income: Income) => void;
}

const getStatusConfig = (status: IncomeRecordStatus) => {
  switch (status) {
    case 'PAID':
      return {
        color: 'success' as const,
        label: 'Fully Paid',
        icon: CheckCircle,
        bgColor: 'bg-success-50 dark:bg-success-900/10',
        borderColor: 'border-success-200 dark:border-success-800',
        textColor: 'text-success-700 dark:text-success-300',
      };
    case 'PARTIALLY_PAID':
      return {
        color: 'warning' as const,
        label: 'Partially Paid',
        icon: AlertCircle,
        bgColor: 'bg-warning-50 dark:bg-warning-900/10',
        borderColor: 'border-warning-200 dark:border-warning-800',
        textColor: 'text-warning-700 dark:text-warning-300',
      };
    case 'UNPAID':
      return {
        color: 'danger' as const,
        label: 'Unpaid',
        icon: AlertCircle,
        bgColor: 'bg-danger-50 dark:bg-danger-900/10',
        borderColor: 'border-danger-200 dark:border-danger-800',
        textColor: 'text-danger-700 dark:text-danger-300',
      };
    case 'REFUNDED':
      return {
        color: 'default' as const,
        label: 'Refunded',
        icon: AlertCircle,
        bgColor: 'bg-default-50 dark:bg-default-900/10',
        borderColor: 'border-default-200 dark:border-default-800',
        textColor: 'text-default-700 dark:text-default-300',
      };
    case 'PARTIALLY_REFUNDED':
      return {
        color: 'secondary' as const,
        label: 'Partially Refunded',
        icon: AlertCircle,
        bgColor: 'bg-secondary-50 dark:bg-secondary-900/10',
        borderColor: 'border-secondary-200 dark:border-secondary-800',
        textColor: 'text-secondary-700 dark:text-secondary-300',
      };
    default:
      return {
        color: 'default' as const,
        label: status,
        icon: AlertCircle,
        bgColor: 'bg-default-50 dark:bg-default-900/10',
        borderColor: 'border-default-200 dark:border-default-800',
        textColor: 'text-default-700 dark:text-default-300',
      };
  }
};

export function OtherIncomeModal({
  income,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: OtherIncomeModalProps) {
  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'BANK_TRANSFER':
        return 'Bank Transfer';
      case 'CASH':
        return 'Cash';
      case 'CARD':
        return 'Card';
      case 'MOBILE_MONEY':
        return 'Mobile Money';
      case 'CHEQUE':
        return 'Cheque';
      default:
        return method;
    }
  };

  const formatCategoryLabel = (category: string) => {
    return category
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  };

  const getCategoryColor = (mainCategory?: string) => {
    switch (mainCategory) {
      case 'BUSINESS_PROFIT':
        return 'success';
      case 'EMPLOYMENT_INCOME':
        return 'primary';
      case 'INVESTMENT_INCOME':
        return 'secondary';
      default:
        return 'warning';
    }
  };

  if (!income) return null;

  const statusConfig = getStatusConfig(income.status);
  const StatusIcon = statusConfig.icon;
  const canEdit = income.status !== 'PAID';
  const canDelete = income.status !== 'PAID';

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      size="lg"
      onClose={onClose}
      scrollBehavior="inside"
      classNames={{
        base: 'max-h-[90vh]',
        body: 'py-6',
      }}
    >
      <ModalContent>
        {() => (
          <>
            {/* Header */}
            <ModalHeader className="flex items-center justify-between pb-4 border-b border-divider">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Chip
                    className="h-6"
                    color={statusConfig.color}
                    size="sm"
                    variant="flat"
                    startContent={<StatusIcon className="w-3.5 h-3.5" />}
                  >
                    <span className="text-xs font-medium">
                      {statusConfig.label}
                    </span>
                  </Chip>

                  {income.includesVAT && (
                    <Chip
                      className="h-6"
                      color="primary"
                      size="sm"
                      variant="flat"
                    >
                      <span className="text-xs font-medium">Includes VAT</span>
                    </Chip>
                  )}
                </div>
                <h3 className="text-lg font-semibold">
                  {income.incomeSubCategory
                    ? income.customSubCategory ||
                      formatCategoryLabel(income.incomeSubCategory)
                    : 'Other Income'}
                </h3>
                {income.reference && (
                  <p className="text-sm text-default-500 font-normal mt-0.5">
                    {income.reference}
                  </p>
                )}
              </div>

              {/* Action Icons */}
              <div className="flex items-center gap-2">
                {canEdit && onEdit && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => {
                      onEdit(income);
                      onClose();
                    }}
                    aria-label="Edit income"
                  >
                    <Edit size={18} />
                  </Button>
                )}
                {canDelete && onDelete && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={() => {
                      onDelete(income);
                      onClose();
                    }}
                    aria-label="Delete income"
                  >
                    <Trash2 size={18} />
                  </Button>
                )}
              </div>
            </ModalHeader>

            <ModalBody>
              {/* Description */}
              {(income.notes || income.sourceDescription) && (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-default-500 mb-1">Description</p>
                    <p className="text-sm leading-relaxed">
                      {income.notes || income.sourceDescription}
                    </p>
                  </div>
                  <Divider className="mb-4" />
                </>
              )}

              {/* Details Grid */}
              <div className="space-y-4">
                {/* Income Date */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                    <Calendar size={18} className="text-default-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-default-500">Income Date</p>
                    <p className="text-sm font-medium">
                      {formatDate(income.date)}
                    </p>
                  </div>
                </div>

                {/* Category */}
                {income.incomeMainCategory && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Tag size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500 mb-1.5">
                        Category
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Chip
                          size="sm"
                          variant="flat"
                          color={
                            getCategoryColor(income.incomeMainCategory) as any
                          }
                        >
                          {formatCategoryLabel(income.incomeMainCategory)}
                        </Chip>
                        {income.incomeSubCategory && (
                          <Chip size="sm" variant="bordered">
                            {income.customSubCategory ||
                              formatCategoryLabel(income.incomeSubCategory)}
                          </Chip>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Method */}
                {income.amountPaid > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <CreditCard size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Payment Method</p>
                      <p className="text-sm font-medium">
                        {getPaymentMethodLabel(income.paymentMethod)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Tax Information */}
                {income.taxablePercentage !== null && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Receipt size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">
                        Taxable Percentage
                      </p>
                      <p className="text-sm font-medium">
                        {income.taxablePercentage}%
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Information */}
              {(income.customerName ||
                income.customerEmail ||
                income.customerPhone) && (
                <>
                  <Divider className="my-4" />
                  <div>
                    <p className="text-sm text-default-500 mb-3 flex items-center gap-2">
                      <User size={16} />
                      Customer Information
                    </p>
                    <div className="space-y-2">
                      {income.customerName && (
                        <div className="flex justify-between items-center p-3 bg-default-50 dark:bg-default-100/50 rounded-lg">
                          <p className="text-xs text-default-500">Name</p>
                          <p className="text-sm font-medium">
                            {income.customerName}
                          </p>
                        </div>
                      )}
                      {income.customerEmail && (
                        <div className="flex justify-between items-center p-3 bg-default-50 dark:bg-default-100/50 rounded-lg">
                          <p className="text-xs text-default-500">Email</p>
                          <p className="text-sm font-medium">
                            {income.customerEmail}
                          </p>
                        </div>
                      )}
                      {income.customerPhone && (
                        <div className="flex justify-between items-center p-3 bg-default-50 dark:bg-default-100/50 rounded-lg">
                          <p className="text-xs text-default-500">Phone</p>
                          <p className="text-sm font-medium">
                            {income.customerPhone}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Payment History */}
              {income.payments && income.payments.length > 0 && (
                <>
                  <Divider className="my-4" />
                  <div>
                    <p className="text-sm text-default-500 mb-3">
                      Payment History ({income.payments.length})
                    </p>
                    <div className="space-y-2">
                      {income.payments.map(payment => (
                        <div
                          key={payment.id}
                          className="flex justify-between items-center p-3 bg-default-50 dark:bg-default-100/50 rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {formatDate(payment.paymentDate)}
                            </p>
                            <p className="text-xs text-default-500 mt-0.5">
                              {getPaymentMethodLabel(payment.paymentMethod)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-success-600">
                              {formatCurrency(payment.amount)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Amount Summary */}
              <Divider className="my-4" />
              <div className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h4 className="text-base font-semibold flex items-center gap-2 mb-3">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  Amount Summary
                </h4>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-default-600">Total Amount:</span>
                    <span className="font-medium">
                      {formatCurrency(income.amount)}
                    </span>
                  </div>

                  {income.includesVAT && income.vatAmount !== null && (
                    <div className="flex justify-between">
                      <span className="text-default-600">VAT Amount:</span>
                      <span className="font-medium">
                        {formatCurrency(income.vatAmount)}
                      </span>
                    </div>
                  )}

                  {income.status !== 'PAID' && (
                    <>
                      <div className="h-px bg-default-200 my-2" />
                      <div className="flex justify-between">
                        <span className="text-default-600">
                          Amount Received:
                        </span>
                        <span className="font-medium text-success-600">
                          {formatCurrency(income.amountPaid)}
                        </span>
                      </div>
                      <div className="flex justify-between text-base font-bold">
                        <span>Balance Due:</span>
                        <span className="text-warning-600">
                          {formatCurrency(income.balance)}
                        </span>
                      </div>
                    </>
                  )}

                  {income.status === 'PAID' && (
                    <>
                      <div className="h-px bg-default-200 my-2" />
                      <div className="flex justify-between text-base font-bold">
                        <span>Amount Received:</span>
                        <span className="text-green-600">
                          {formatCurrency(income.amountPaid)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Status Warning */}
              {!canEdit && (
                <>
                  <Divider className="my-4" />
                  <div className="bg-success-50 dark:bg-success-950/30 rounded-lg p-3">
                    <p className="text-sm text-success-700 dark:text-success-300">
                      ℹ️ This income has been fully paid and recorded.
                    </p>
                  </div>
                </>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
