'use client';

import { Card, CardBody } from '@heroui/react';
import { CreditCard, Calendar, TrendingUp, AlertCircle } from 'lucide-react';

import { formatCurrency, formatDate } from '@/lib/fn';
import { Purchase } from '@/types/purchases';

interface PurchasePaymentSectionProps {
  purchase: Purchase;
  onPaymentUpdate?: () => void;
}

export function PurchasePaymentSection({
  purchase,
}: PurchasePaymentSectionProps) {
  const payments = purchase.payments || [];
  const hasPayments = payments.length > 0;

  const getStatusColor = () => {
    if (purchase.balance === 0) return 'success';
    if (purchase.amountPaid > 0) return 'warning';
    return 'danger';
  };

  const getStatusText = () => {
    if (purchase.balance === 0) return 'Fully Paid';
    if (purchase.amountPaid > 0) return 'Partially Paid';
    return 'Unpaid';
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'CASH':
        return '💵';
      case 'BANK_TRANSFER':
        return '🏦';
      case 'CARD':
        return '💳';
      case 'MOBILE_MONEY':
        return '📱';
      case 'CHEQUE':
        return '📄';
      default:
        return '💰';
    }
  };

  return (
    <Card className="rounded-2xl" shadow="none">
      <CardBody className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <CreditCard className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Payment Information</h3>
        </div>

        {/* Payment Status */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-default-600">
              Payment Status
            </span>
            <span
              className={`text-sm font-bold ${
                purchase.balance > 0 ? 'text-danger' : 'text-success'
              }`}
            >
              {getStatusText()}
            </span>
          </div>

          <div className="w-full bg-default-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                purchase.balance === 0 ? 'bg-success' : 'bg-warning'
              }`}
              style={{
                width: `${purchase.totalAmount > 0 ? (purchase.amountPaid / purchase.totalAmount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Payment Summary */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-default-600">Total Amount:</span>
            <span className="font-medium">
              {formatCurrency(purchase.totalAmount)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-default-600">Amount Paid:</span>
            <span className="font-medium text-success">
              {formatCurrency(purchase.amountPaid)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-default-600">Balance:</span>
            <span
              className={`font-bold ${
                purchase.balance > 0 ? 'text-danger' : 'text-success'
              }`}
            >
              {formatCurrency(purchase.balance)}
            </span>
          </div>
        </div>

        {/* Payment History */}
        {hasPayments && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-default-600">
              Payment History
            </h4>
            <div className="space-y-2">
              {payments.map((payment, index) => (
                <div
                  key={payment.id}
                  className="p-3 bg-default-50 dark:bg-default-100 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {getPaymentMethodIcon(payment.paymentMethod)}
                      </span>
                      <span className="text-sm font-medium">
                        {payment.paymentMethod.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-success">
                      {formatCurrency(payment.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-default-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(payment.paymentDate)}</span>
                    </div>
                    {payment.reference && <span>Ref: {payment.reference}</span>}
                  </div>
                  {payment.notes && (
                    <p className="text-xs text-default-500 mt-1">
                      {payment.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Payments */}
        {!hasPayments && (
          <div className="text-center py-4">
            <div className="bg-warning-50 dark:bg-warning-900/20 p-4 rounded-lg">
              <AlertCircle className="w-8 h-8 mx-auto text-warning mb-2" />
              <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
                No Payments Recorded
              </p>
              <p className="text-xs text-warning-700 dark:text-warning-300 mt-1">
                {formatCurrency(purchase.totalAmount)} outstanding
              </p>
            </div>
          </div>
        )}

        {/* Payment Progress */}
        {purchase.amountPaid > 0 && purchase.balance > 0 && (
          <div className="mt-4 p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-warning" />
              <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
                Partial Payment Progress
              </p>
            </div>
            <p className="text-xs text-warning-700 dark:text-warning-300 mt-1">
              {formatCurrency(purchase.amountPaid)} paid •{' '}
              {formatCurrency(purchase.balance)} remaining
            </p>
          </div>
        )}

        {/* Fully Paid */}
        {purchase.balance === 0 && purchase.amountPaid > 0 && (
          <div className="mt-4 p-3 bg-success-50 dark:bg-success-900/20 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-success" />
              <p className="text-sm font-medium text-success-800 dark:text-success-200">
                Fully Paid
              </p>
            </div>
            <p className="text-xs text-success-700 dark:text-success-300 mt-1">
              This purchase has been completely paid for
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
