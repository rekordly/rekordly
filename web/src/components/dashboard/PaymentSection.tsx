'use client';

import { Card, CardBody, Button } from '@heroui/react';
import { CreditCard, TrendingUp, AlertCircle, Plus } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/fn';
import { PaymentRecord } from '@/types';
import { EditPaymentModal } from '@/components/modals/EditPaymentModal';
import { DeletePaymentModal } from '@/components/modals/DeletePaymentModal';
import { useSaleStore } from '@/store/saleStore';
import { usePurchaseStore } from '@/store/purchase-store';
import { useQuotationStore } from '@/store/quotationStore';
import { Receipt, ArrowRight } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';

// Types
interface EditPaymentModalProps {
  payment: PaymentRecord;
  totalAmount: number;
  currentTotalPaid: number;
  onSuccess?: (data: any) => void;
}

interface PaymentSectionProps {
  totalAmount: number;
  amountPaid: number;
  balance: number;
  payments?: PaymentRecord[];
  onAddPayment?: () => void;
  showActions?: boolean;
  onPaymentUpdate?: () => void;
  entityType: 'sale' | 'purchase' | 'quotation' | 'invoice';
  entityId: string;
  entityNumber?: string;
}

export function PaymentSection({
  totalAmount,
  amountPaid,
  balance,
  payments = [],
  onAddPayment,
  showActions = false,
  onPaymentUpdate,
  entityType,
  entityId,
  entityNumber,
}: PaymentSectionProps) {
  const router = useRouter();
  const hasPayments = payments.length > 0;

  // Get the appropriate update function based on entity type
  const { updateSale } = useSaleStore();
  const { updatePurchase } = usePurchaseStore();
  const { updateQuotation } = useQuotationStore();

  const handleEditSuccess = (data: any) => {
    // if (data.sale) updateSale(entityId, data.sale);
    // if (data.puchase) updatePurchase(entityId, data.puchase);
    // if (data.quotation) updateQuotation(entityId, data.quotation);
    console.log(data?.entity);
    if (data?.entity) {
      switch (entityType) {
        case 'sale':
          updateSale(entityId, data.entity);
          break;
        case 'purchase':
          updatePurchase(entityId, data.entity);
          break;
        case 'quotation':
          updateQuotation(entityId, data.entity);
          break;
      }
    }

    // Call the onPaymentUpdate callback if provided
    if (onPaymentUpdate) {
      onPaymentUpdate();
    }
  };

  const getStatusText = () => {
    if (balance === 0) return 'Fully Paid';
    if (amountPaid > 0) return 'Partially Paid';
    return 'Unpaid';
  };

  const formatPaymentMethod = (method: string) => {
    return method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const paymentPercentage =
    totalAmount > 0 ? (amountPaid / totalAmount) * 100 : 0;

  return (
    <Card className="rounded-2xl" shadow="none">
      <CardBody className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Receipt size={18} />
            <h3 className="text-lg font-semibold">Payment Information</h3>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-bold ${
                balance > 0 ? 'text-danger' : 'text-success'
              }`}
            >
              {getStatusText()}
            </span>
            {showActions && onAddPayment && (
              <button
                onClick={onAddPayment}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Payment
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          {/* <div className="flex justify-between text-xs text-default-500 mt-1">
            <span>{Math.round(paymentPercentage)}% paid</span>
            <span>{formatCurrency(balance)} remaining</span>
          </div> */}
          <div className="w-full bg-default-100 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                balance === 0 ? 'bg-success' : 'bg-warning'
              }`}
              style={{
                width: `${Math.min(paymentPercentage, 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-default-500 mt-1">
            <span>{Math.round(paymentPercentage)}% paid</span>
            <span>{formatCurrency(balance)} remaining</span>
          </div>
        </div>

        {/* Payment Summary */}
        {/* <div className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-default-600">Total Amount:</span>
            <span className="font-medium">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-default-600">Amount Paid:</span>
            <span className="font-medium text-success">
              {formatCurrency(amountPaid)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-default-600">Balance:</span>
            <span
              className={`font-bold ${
                balance > 0 ? 'text-danger' : 'text-success'
              }`}
            >
              {formatCurrency(balance)}
            </span>
          </div>
        </div> */}

        {/* No Payments */}
        {!hasPayments && (
          <div className="text-center py-4">
            <div className="bg-warning-50 dark:bg-warning-900/20 p-4 rounded-lg">
              <AlertCircle className="w-8 h-8 mx-auto text-warning mb-2" />
              <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
                No Payments Recorded
              </p>
              <p className="text-xs text-warning-700 dark:text-warning-300 mt-1">
                {formatCurrency(totalAmount)} outstanding
              </p>
            </div>
          </div>
        )}

        {/* Payment Status Alert */}
        {amountPaid > 0 && balance > 0 && (
          <div className="mb-4 p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-warning" />
              <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
                Partial Payment Progress
              </p>
            </div>
            <p className="text-xs text-warning-700 dark:text-warning-300 mt-1">
              {formatCurrency(totalAmount)} Total Amount • <br />
              {formatCurrency(amountPaid)} paid • {formatCurrency(balance)}{' '}
              remaining
            </p>
          </div>
        )}

        {balance === 0 && amountPaid > 0 && (
          <div className="mb-4 p-3 bg-success-50 dark:bg-success-900/20 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-success" />
              <p className="text-sm font-medium text-success-800 dark:text-success-200">
                Fully Paid
              </p>
            </div>
            <p className="text-xs text-success-700 dark:text-success-300 mt-1">
              This transaction has been completely paid the amount of{' '}
              {formatCurrency(totalAmount)}
            </p>
          </div>
        )}

        {/* Payment History */}
        {hasPayments && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-default-500">
              Payments ({payments.length})
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {payments.map(payment => (
                <div
                  key={payment.id}
                  className="p-3 bg-default-50 rounded-lg space-y-1"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-default-700">
                        {formatPaymentMethod(payment.paymentMethod)}
                      </p>
                      <p className="text-xs text-default-500">
                        {formatDate(payment.paymentDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-success-600">
                        {formatCurrency(payment.amount)}
                      </p>
                      {showActions && (
                        <div className="flex items-center gap-1">
                          <EditPaymentModal
                            currentTotalPaid={amountPaid}
                            payment={payment}
                            totalAmount={totalAmount}
                            onSuccess={handleEditSuccess}
                          />
                          <DeletePaymentModal
                            entityId={entityId}
                            entityType={entityType}
                            payment={payment}
                            onSuccess={onPaymentUpdate}
                          />
                        </div>
                      )}
                    </div>
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
        )}

        {entityType === 'invoice' && entityNumber && (
          <Button
            className="w-full font-semibold mt-3"
            color="primary"
            endContent={<ArrowRight size={14} weight="bold" />}
            size="sm"
            variant="flat"
            onPress={() => router.push(`/dashboard/sales/${entityNumber}`)}
          >
            View Receipt
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
