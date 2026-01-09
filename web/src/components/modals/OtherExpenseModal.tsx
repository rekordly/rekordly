'use client';

import React from 'react';
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
  Calendar,
  CreditCard,
  Tag,
  User,
  DollarSign,
  Edit,
  Trash2,
  Receipt,
  FileText,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Expense, ExpenseStatus } from '@/types/expenses';
import { formatCurrency, formatDate } from '@/lib/fn';

interface OtherExpenseModalProps {
  expense: Expense | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
}

const getStatusConfig = (status: ExpenseStatus) => {
  switch (status) {
    case ExpenseStatus.PAID:
      return {
        color: 'success' as const,
        label: 'Fully Paid',
        icon: CheckCircle,
      };
    case ExpenseStatus.PARTIALLY_PAID:
      return {
        color: 'warning' as const,
        label: 'Partially Paid',
        icon: AlertCircle,
      };
    case ExpenseStatus.UNPAID:
      return {
        color: 'danger' as const,
        label: 'Unpaid',
        icon: AlertCircle,
      };
    case ExpenseStatus.REFUNDED:
      return {
        color: 'default' as const,
        label: 'Refunded',
        icon: AlertCircle,
      };
    case ExpenseStatus.PARTIALLY_REFUNDED:
      return {
        color: 'secondary' as const,
        label: 'Partially Refunded',
        icon: AlertCircle,
      };
    default:
      return {
        color: 'default' as const,
        label: status,
        icon: AlertCircle,
      };
  }
};

export function OtherExpenseModal({
  expense,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: OtherExpenseModalProps) {
  if (!expense) return null;

  const statusConfig = getStatusConfig(expense.status);
  const StatusIcon = statusConfig.icon;
  const canEdit = expense.status !== ExpenseStatus.PAID;
  const canDelete = expense.status !== ExpenseStatus.PAID;

  const getPaymentMethodLabel = (method: string) => {
    const methods: Record<string, string> = {
      BANK_TRANSFER: 'Bank Transfer',
      CASH: 'Cash',
      CARD: 'Card',
      MOBILE_MONEY: 'Mobile Money',
      CHEQUE: 'Cheque',
      OTHER: 'Other',
      UNPAID: 'Not Paid',
    };
    return methods[method] || method;
  };

  const formatCategoryLabel = (category: string) => {
    return category
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  };

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

                  {expense.isDeductible && (
                    <Chip
                      className="h-6"
                      color="success"
                      size="sm"
                      variant="flat"
                    >
                      <span className="text-xs font-medium">
                        Tax Deductible
                      </span>
                    </Chip>
                  )}

                  {expense.sourceType === 'PURCHASE' && (
                    <Chip
                      className="h-6"
                      color="primary"
                      size="sm"
                      variant="flat"
                    >
                      <span className="text-xs font-medium">Purchase</span>
                    </Chip>
                  )}
                </div>
                <h3 className="text-lg font-semibold">
                  {expense.category
                    ? formatCategoryLabel(expense.category)
                    : 'Other Expense'}
                </h3>
                {expense.reference && (
                  <p className="text-sm text-default-500 font-normal mt-0.5">
                    {expense.reference}
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
                      onEdit(expense);
                      onClose();
                    }}
                    aria-label="Edit expense"
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
                      onDelete(expense);
                      onClose();
                    }}
                    aria-label="Delete expense"
                  >
                    <Trash2 size={18} />
                  </Button>
                )}
              </div>
            </ModalHeader>

            <ModalBody>
              {/* Notes/Description */}
              {(expense.notes || expense.sourceDescription) && (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-default-500 mb-1">Description</p>
                    <p className="text-sm leading-relaxed">
                      {expense.notes || expense.sourceDescription}
                    </p>
                  </div>
                  <Divider className="mb-4" />
                </>
              )}

              {/* Details Grid */}
              <div className="space-y-4">
                {/* Date */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                    <Calendar size={18} className="text-default-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-default-500">Expense Date</p>
                    <p className="text-sm font-medium">
                      {formatDate(expense.date)}
                    </p>
                  </div>
                </div>

                {/* Category & Subcategory */}
                {(expense.category || expense.subCategory) && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Tag size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500 mb-1.5">
                        Category
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {expense.category && (
                          <Chip size="sm" variant="flat" color="primary">
                            {formatCategoryLabel(expense.category)}
                          </Chip>
                        )}
                        {expense.subCategory && (
                          <Chip size="sm" variant="bordered">
                            {expense.subCategory}
                          </Chip>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Method */}
                {expense.amountPaid > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <CreditCard size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Payment Method</p>
                      <p className="text-sm font-medium">
                        {getPaymentMethodLabel(expense.paymentMethod)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Vendor */}
                {expense.vendorName && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <User size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Vendor</p>
                      <p className="text-sm font-medium">
                        {expense.vendorName}
                      </p>
                    </div>
                  </div>
                )}

                {/* Tax Deductibility */}
                {expense.isDeductible !== undefined && expense.isDeductible && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Receipt size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Tax Deduction</p>
                      <p className="text-sm font-medium">
                        {expense.deductionPercentage || 100}%
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment History */}
              {expense.payments && expense.payments.length > 0 && (
                <>
                  <Divider className="my-4" />
                  <div>
                    <p className="text-sm text-default-500 mb-3">
                      Payment History ({expense.payments.length})
                    </p>
                    <div className="space-y-2">
                      {expense.payments.map(payment => (
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
                            <p className="text-sm font-medium text-danger-600">
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
              <div className="bg-linear-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <h4 className="text-base font-semibold flex items-center gap-2 mb-3">
                  <DollarSign className="w-5 h-5 text-red-600" />
                  Amount Summary
                </h4>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-default-600">Total Amount:</span>
                    <span className="font-medium">
                      {formatCurrency(expense.amount)}
                    </span>
                  </div>

                  {expense.includesVAT && expense.vatAmount !== null && (
                    <div className="flex justify-between">
                      <span className="text-default-600">VAT Amount:</span>
                      <span className="font-medium">
                        {formatCurrency(expense.vatAmount)}
                      </span>
                    </div>
                  )}

                  {expense.status !== ExpenseStatus.PAID && (
                    <>
                      <div className="h-px bg-default-200 my-2" />
                      <div className="flex justify-between">
                        <span className="text-default-600">Amount Paid:</span>
                        <span className="font-medium text-success-600">
                          {formatCurrency(expense.amountPaid)}
                        </span>
                      </div>
                      <div className="flex justify-between text-base font-bold">
                        <span>Balance Due:</span>
                        <span className="text-warning-600">
                          {formatCurrency(expense.balance)}
                        </span>
                      </div>
                    </>
                  )}

                  {expense.status === ExpenseStatus.PAID && (
                    <>
                      <div className="h-px bg-default-200 my-2" />
                      <div className="flex justify-between text-base font-bold">
                        <span>Amount Paid:</span>
                        <span className="text-red-600">
                          {formatCurrency(expense.amountPaid)}
                        </span>
                      </div>
                    </>
                  )}

                  {expense.isDeductible && (
                    <>
                      <div className="h-px bg-default-200 my-2" />
                      <div className="flex justify-between">
                        <span className="text-default-600">
                          Deductible Amount:
                        </span>
                        <span className="font-medium text-success-600">
                          {formatCurrency(
                            expense.amount *
                              ((expense.deductionPercentage || 100) / 100)
                          )}
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
                      ℹ️ This expense has been fully paid and recorded.
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
