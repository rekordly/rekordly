'use client';

import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
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
  entityType: 'sale' | 'purchase' | 'quotation' | 'invoice';
  entityId: string;
  onSuccess?: () => void;
}

export function DeletePaymentModal({
  payment,
  entityType,
  entityId,
  onSuccess,
}: DeletePaymentModalProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();

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
    <>
      <Button
        isIconOnly
        aria-label="Delete payment"
        className="min-w-unit-7 w-unit-7 h-unit-7"
        color="danger"
        size="sm"
        variant="light"
        onPress={onOpen}
      >
        <Trash size={16} />
      </Button>

      {/* Delete Confirmation Modal */}
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
              <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
                Delete Payment
              </ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Are you sure you want to delete this payment? This action
                  cannot be undone.
                </p>
                <div className="mt-2 p-2 bg-default-100 rounded-lg text-xs">
                  <p>
                    <span className="font-medium">Amount:</span> ₦
                    {payment.amount.toLocaleString()}
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
                  {isLoading ? 'Deleting' : 'Delete'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
