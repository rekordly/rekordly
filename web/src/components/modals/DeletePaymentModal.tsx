'use client';

import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  addToast,
} from '@heroui/react';
import { Trash } from '@phosphor-icons/react';
import { PaymentRecord } from '@/types';
import { useSaleStore } from '@/store/saleStore';
import { usePurchaseStore } from '@/store/purchase-store';
import { useQuotationStore } from '@/store/quotationStore';
import { useApi } from '@/hooks/useApi';

interface DeletePaymentModalProps {
  payment: PaymentRecord;
  entityType: 'sale' | 'purchase' | 'quotation' | 'invoice' | 'loan';
  entityId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DeletePaymentModal({
  payment,
  entityType,
  entityId,
  isOpen,
  onClose,
  onSuccess,
}: DeletePaymentModalProps) {
  // Get the appropriate store based on entity type
  const { updateSale } = useSaleStore();
  const { updatePurchase } = usePurchaseStore();
  const { updateQuotation } = useQuotationStore();

  const { delete: deletePayment, isLoading } = useApi({
    addToast,
    showSuccessToast: true,
    onSuccess: data => {
      // Update the appropriate store with the updated entity
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

      if (onSuccess) onSuccess();
      handleClose();
    },
  });

  const handleDeleteConfirm = async () => {
    try {
      await deletePayment(`/payments/${payment.id}`);
    } catch (error) {
      console.error('Delete payment error:', error);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      placement="center"
      size="xs"
      onClose={handleClose}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Trash className="text-danger" size={20} />
                <span className="text-base">Delete Payment</span>
              </div>
            </ModalHeader>
            <ModalBody className="py-4">
              <p className="text-sm">
                Are you sure you want to delete this payment? This action cannot
                be undone.
              </p>
              <div className="mt-2 p-2.5 bg-danger-50 dark:bg-danger-900/20 rounded-lg text-xs">
                <p className="text-danger-800 dark:text-danger-200">
                  <span className="font-medium">Amount:</span> ₦
                  {payment.amount.toLocaleString()}
                </p>
                <p className="text-danger-700 dark:text-danger-300 mt-1">
                  <span className="font-medium">Method:</span>{' '}
                  {payment.paymentMethod.replace(/_/g, ' ')}
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                isDisabled={isLoading}
                variant="light"
                onPress={handleClose}
              >
                Cancel
              </Button>
              <Button
                color="danger"
                isLoading={isLoading}
                onPress={handleDeleteConfirm}
              >
                {isLoading ? 'Deleting...' : 'Delete'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
