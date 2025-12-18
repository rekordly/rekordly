'use client';

import {
  Card,
  CardBody,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/react';
import { CreditCard, TrendingUp, AlertCircle } from 'lucide-react';
import { DotsThree, PencilSimple, Trash } from '@phosphor-icons/react';
import { formatCurrency, formatDate } from '@/lib/fn';
import { PaymentRecord } from '@/types';
import { EditPaymentModal } from '@/components/modals/EditPaymentModal';
import { DeletePaymentModal } from '@/components/modals/DeletePaymentModal';
import { useSaleStore } from '@/store/saleStore';
import { usePurchaseStore } from '@/store/purchase-store';
import { useQuotationStore } from '@/store/quotationStore';
import { useLoanStore } from '@/store/loan-store';
import { ArrowRight } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PaymentSectionProps {
  totalAmount: number;
  amountPaid: number;
  balance: number;
  payments?: PaymentRecord[];
  onAddPayment?: () => void;
  showActions?: boolean;
  onPaymentUpdate?: () => void;
  entityType: 'sale' | 'purchase' | 'quotation' | 'invoice' | 'loan';
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
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(
    null
  );
  const [deletingPayment, setDeletingPayment] = useState<PaymentRecord | null>(
    null
  );

  // Get the appropriate update function based on entity type
  const { updateSale } = useSaleStore();
  const { updatePurchase } = usePurchaseStore();
  const { updateQuotation } = useQuotationStore();
  const { updateLoan } = useLoanStore();

  const handleEditSuccess = (data: any) => {
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
        case 'loan':
          updateLoan(entityId, data.entity);
          break;
      }
    }

    if (onPaymentUpdate) {
      onPaymentUpdate();
    }
    setEditingPayment(null);
  };

  const handleDeleteSuccess = () => {
    if (onPaymentUpdate) {
      onPaymentUpdate();
    }
    setDeletingPayment(null);
  };

  const formatPaymentMethod = (method: string) => {
    return method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <>
      <Card className="rounded-3xl bg-brand-background" shadow="none">
        <CardBody className="p-5">
          {/* Payment Summary */}
          <div className="space-y-3 mb-6">
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
            {balance > 0 && (
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
            )}
          </div>

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

          {/* Payment History */}
          {hasPayments && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-default-500">
                Payments ({payments.length})
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {payments.map(payment => (
                  <div
                    key={payment.id}
                    className="flex items-start gap-3 py-2 border-b border-divider last:border-0"
                  >
                    {/* Icon based on category */}
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        payment.category === 'INCOME'
                          ? 'bg-success/10 text-success'
                          : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {payment.category === 'INCOME' ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                    </div>

                    {/* Payment Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-default-700 truncate">
                            {formatPaymentMethod(payment.paymentMethod)}
                          </p>
                          <p className="text-xs text-default-500 mt-0.5">
                            {formatDate(payment.paymentDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p
                            className={`text-sm font-bold ${
                              payment.category === 'INCOME'
                                ? 'text-success'
                                : 'text-danger'
                            }`}
                          >
                            {payment.category === 'INCOME' ? '+' : '-'}
                            {formatCurrency(payment.amount)}
                          </p>
                          {showActions && (
                            <Dropdown placement="bottom-end">
                              <DropdownTrigger>
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  className="text-default-400 hover:text-default-600"
                                >
                                  <DotsThree size={20} weight="bold" />
                                </Button>
                              </DropdownTrigger>
                              <DropdownMenu aria-label="Payment actions">
                                <DropdownItem
                                  key="edit"
                                  startContent={<PencilSimple size={18} />}
                                  onPress={() => setEditingPayment(payment)}
                                >
                                  Edit Payment
                                </DropdownItem>
                                <DropdownItem
                                  key="delete"
                                  className="text-danger"
                                  color="danger"
                                  startContent={<Trash size={18} />}
                                  onPress={() => setDeletingPayment(payment)}
                                >
                                  Delete Payment
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          )}
                        </div>
                      </div>
                      {payment.reference && (
                        <p className="text-xs text-default-400 mt-1">
                          Ref: {payment.reference}
                        </p>
                      )}
                      {payment.notes && (
                        <p className="text-xs text-default-500 italic mt-1 line-clamp-2">
                          {payment.notes}
                        </p>
                      )}
                    </div>
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

      {/* Edit Payment Modal */}
      {editingPayment && (
        <EditPaymentModal
          payment={editingPayment}
          totalAmount={totalAmount}
          currentTotalPaid={amountPaid}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Delete Payment Modal */}
      {deletingPayment && (
        <DeletePaymentModal
          entityId={entityId}
          entityType={entityType}
          payment={deletingPayment}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </>
  );
}
