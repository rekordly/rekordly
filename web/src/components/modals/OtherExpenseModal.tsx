'use client';

import React from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
  Divider,
} from '@heroui/react';
import { X, Calendar, CreditCard, Tag, User } from 'lucide-react';
import { Expense } from '@/types/expenses';
import { formatCurrency, formatDate } from '@/lib/fn';

interface OtherExpenseModalProps {
  expense: Expense | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OtherExpenseModal({
  expense,
  isOpen,
  onClose,
}: OtherExpenseModalProps) {
  if (!expense) return null;

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
              <div>
                <h3 className="text-lg font-semibold">Expense Details</h3>
                <p className="text-sm text-default-500 font-normal mt-0.5">
                  {expense.category
                    ? formatCategoryLabel(expense.category)
                    : 'Other Expense'}
                </p>
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
                <p className="text-2xl font-bold">
                  {formatCurrency(expense.amount)}
                </p>
              </div>

              <Divider className="my-4" />

              {/* Details Grid */}
              <div className="space-y-4">
                {/* Date */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center flex-shrink-0">
                    <Calendar size={18} className="text-default-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-default-500">Date</p>
                    <p className="text-sm font-medium">
                      {formatDate(expense.date)}
                    </p>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center flex-shrink-0">
                    <CreditCard size={18} className="text-default-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-default-500">Payment Method</p>
                    <p className="text-sm font-medium">
                      {getPaymentMethodLabel(expense.paymentMethod)}
                    </p>
                  </div>
                </div>

                {/* Category & Subcategory */}
                {(expense.category || expense.subCategory) && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center flex-shrink-0">
                      <Tag size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Category</p>
                      <p className="text-sm font-medium">
                        {expense.category &&
                          formatCategoryLabel(expense.category)}
                      </p>
                      {expense.subCategory && (
                        <p className="text-xs text-default-400 mt-0.5">
                          {expense.subCategory}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Vendor */}
                {expense.vendorName && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center flex-shrink-0">
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

                {/* Reference */}
                {expense.reference && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center flex-shrink-0">
                      <Tag size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Reference</p>
                      <p className="text-sm font-medium break-all">
                        {expense.reference}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Tax Deductibility */}
              {expense.isDeductible !== undefined && (
                <>
                  <Divider className="my-4" />
                  <div className="bg-default-50 dark:bg-default-100/50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-default-600">Tax Deductible</p>
                      <p className="text-sm font-semibold">
                        {expense.isDeductible
                          ? `${expense.deductionPercentage || 100}%`
                          : 'No'}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              {expense.notes && (
                <>
                  <Divider className="my-4" />
                  <div>
                    <p className="text-xs text-default-500 mb-2">Notes</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {expense.notes}
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
