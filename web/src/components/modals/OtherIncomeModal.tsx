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
} from 'lucide-react';
import { Income } from '@/types/income';
import { formatCurrency, formatDate } from '@/lib/fn';

interface OtherIncomeModalProps {
  income: Income | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OtherIncomeModal({
  income,
  isOpen,
  onClose,
}: OtherIncomeModalProps) {
  if (!income) return null;

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'BANK_TRANSFER':
        return 'Bank Transfer';
      case 'CASH':
        return 'Cash';
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

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      placement="center"
      size="2xl"
      onClose={onClose}
    >
      <ModalContent className="bg-brand-background">
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-3 font-heading tracking-tight border-b border-default-200 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
                    <Wallet className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Income Details</h3>
                    <p className="text-sm text-default-500 font-normal mt-0.5">
                      {income.incomeSubCategory
                        ? income.customSubCategory ||
                          formatCategoryLabel(income.incomeSubCategory)
                        : 'Other Income'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Amount Display */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 rounded-xl p-4 border border-amber-200/50 dark:border-amber-800/30">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-default-600">
                    Amount Received
                  </span>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(income.amount)}
                    </p>
                    {income.includesVAT && income.vatAmount !== null && (
                      <p className="text-xs text-default-500 mt-1">
                        Includes VAT: {formatCurrency(income.vatAmount)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </ModalHeader>

            <ModalBody className="gap-4 py-6">
              {/* Category Information */}
              {income.incomeMainCategory && (
                <div className="bg-default-50 dark:bg-default-900/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="w-4 h-4 text-default-600" />
                    <h4 className="text-sm font-semibold text-default-700">
                      Category
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      size="md"
                      variant="flat"
                      color={getCategoryColor(income.incomeMainCategory) as any}
                      className="font-medium"
                    >
                      {formatCategoryLabel(income.incomeMainCategory)}
                    </Chip>
                    {income.incomeSubCategory && (
                      <Chip size="md" variant="bordered">
                        {income.customSubCategory ||
                          formatCategoryLabel(income.incomeSubCategory)}
                      </Chip>
                    )}
                  </div>
                </div>
              )}

              {/* Transaction Details */}
              <div className="bg-default-50 dark:bg-default-900/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-default-600" />
                  <h4 className="text-sm font-semibold text-default-700">
                    Transaction Details
                  </h4>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-default-400" />
                      <span className="text-sm text-default-600">Date</span>
                    </div>
                    <span className="text-sm font-medium">
                      {formatDate(income.date)}
                    </span>
                  </div>

                  <div className="h-px bg-divider" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-default-400" />
                      <span className="text-sm text-default-600">
                        Payment Method
                      </span>
                    </div>
                    <Chip size="sm" variant="flat">
                      {getPaymentMethodLabel(income.paymentMethod)}
                    </Chip>
                  </div>

                  {income.reference && (
                    <>
                      <div className="h-px bg-divider" />
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4 text-default-400 flex-shrink-0" />
                          <span className="text-sm text-default-600">
                            Reference
                          </span>
                        </div>
                        <span className="text-sm font-medium text-right break-all">
                          {income.reference}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Customer Information */}
              {(income.customerName ||
                income.customerEmail ||
                income.customerPhone) && (
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-200/50 dark:border-blue-800/30">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                      Customer Information
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {income.customerName && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-700 dark:text-blue-300">
                          Name
                        </span>
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {income.customerName}
                        </span>
                      </div>
                    )}
                    {income.customerEmail && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-700 dark:text-blue-300">
                          Email
                        </span>
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {income.customerEmail}
                        </span>
                      </div>
                    )}
                    {income.customerPhone && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-700 dark:text-blue-300">
                          Phone
                        </span>
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {income.customerPhone}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {income.notes && (
                <div className="bg-default-50 dark:bg-default-900/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-default-600" />
                    <h4 className="text-sm font-semibold text-default-700">
                      Notes
                    </h4>
                  </div>
                  <p className="text-sm text-default-700 leading-relaxed whitespace-pre-wrap">
                    {income.notes}
                  </p>
                </div>
              )}
            </ModalBody>

            <ModalFooter className="border-t border-default-200">
              <Button variant="light" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
