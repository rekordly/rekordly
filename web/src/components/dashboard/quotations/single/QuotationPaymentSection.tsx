'use client';

import { Card, CardBody, Chip } from '@heroui/react';
import { Receipt, CheckCircle, WarningCircle } from '@phosphor-icons/react';

import { formatCurrency, formatDate } from '@/lib/fn';
import { Quotation } from '@/types/quotations';

interface QuotationPaymentSectionProps {
  quotation: Quotation;
}

export default function QuotationPaymentSection({
  quotation,
}: QuotationPaymentSectionProps) {
  if (!quotation.payments || quotation.payments.length === 0) return null;

  const isFullyPaid = quotation.balance === 0;
  const hasBalance = quotation.balance > 0;

  return (
    <Card className="w-full bg-brand-background rounded-xl" shadow="none">
      <CardBody className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs md:text-sm text-default-500 uppercase tracking-wider flex items-center gap-1.5">
            <Receipt size={14} />
            Payment History
          </p>
          {isFullyPaid && (
            <Chip
              className="h-5"
              color="success"
              size="sm"
              startContent={<CheckCircle size={12} weight="fill" />}
              variant="flat"
            >
              Paid
            </Chip>
          )}
          {hasBalance && (
            <Chip
              className="h-5"
              color="warning"
              size="sm"
              startContent={<WarningCircle size={12} weight="fill" />}
              variant="solid"
            >
              Partial
            </Chip>
          )}
        </div>

        <div className="space-y-3">
          {/* Payment Summary */}
          <div className="space-y-2.5 pb-3 border-b border-default-200">
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-default-600">
                Total Amount
              </span>
              <span className="text-sm md:text-base font-bold text-default-900">
                {formatCurrency(quotation.totalAmount)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm text-default-600">
                Amount Paid
              </span>
              <span className="text-sm md:text-base font-bold text-success-500">
                {formatCurrency(quotation.amountPaid)}
              </span>
            </div>
            {hasBalance && (
              <div className="flex justify-between items-center">
                <span className="text-xs md:text-sm font-semibold text-default-700">
                  Balance Due
                </span>
                <span className="text-sm font-bold text-danger-500">
                  {formatCurrency(quotation.balance)}
                </span>
              </div>
            )}
          </div>

          {/* Payment List */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-default-500">Payments</p>
            {quotation.payments.map(payment => (
              <div
                key={payment.id}
                className="p-3 bg-default-50 rounded-lg space-y-1"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-default-700">
                      {payment.paymentMethod.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-default-500">
                      {formatDate(payment.paymentDate)}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-success-600">
                    {formatCurrency(payment.amount)}
                  </p>
                </div>
                {payment.reference && (
                  <p className="text-xs text-default-500">
                    Ref: {payment.reference}
                  </p>
                )}
                {payment.notes && (
                  <p className="text-xs text-default-600 italic">
                    {payment.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
