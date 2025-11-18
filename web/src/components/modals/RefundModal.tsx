'use client';

import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Chip,
  addToast,
  Alert,
} from '@heroui/react';
import { ArrowUUpLeft } from '@phosphor-icons/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';

import { TextInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { useApi } from '@/hooks/useApi';
import { RefundSchema } from '@/lib/validations/general';
import { RefundType } from '@/types';

interface RefundModalProps {
  itemType: 'sale' | 'quotation' | 'purchase';
  itemId: string;
  itemNumber: string;
  totalAmount: number;
  amountPaid: number;

  onSuccess?: (data: any) => void;
}

export function RefundModal({
  itemType,
  itemId,
  itemNumber,
  totalAmount,
  amountPaid,
  onSuccess,
}: RefundModalProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const methods = useForm<RefundType>({
    resolver: zodResolver(RefundSchema) as Resolver<RefundType>,
    defaultValues: {
      refundReason: '',
      refundDate: new Date(),
    },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
  } = methods;

  const { post, isLoading } = useApi({
    addToast,
    showSuccessToast: true,
    onSuccess: data => {
      if (onSuccess) onSuccess(data);
      handleClose();
    },
  });

  const onSubmit = async (data: RefundType) => {
    try {
      const endpoint = `/${itemType}s/${itemId}/refund`;
      await post(endpoint, data);
    } catch (error) {
      console.error('Refund error:', error);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const getItemLabel = () => {
    switch (itemType) {
      case 'sale':
        return 'Sale';
      case 'quotation':
        return 'Quotation';
      case 'purchase':
        return 'Purchase';
      default:
        return 'Transaction';
    }
  };

  return (
    <>
      <Button
        className="w-full font-semibold"
        color="danger"
        size="md"
        startContent={<ArrowUUpLeft size={16} weight="bold" />}
        variant="flat"
        onPress={onOpen}
      >
        Process Full Refund
      </Button>

      <Modal
        backdrop="blur"
        isOpen={isOpen}
        placement="center"
        size="lg"
        onClose={handleClose}
      >
        <ModalContent>
          {() => (
            <FormProvider {...methods}>
              <form onSubmit={handleSubmit(onSubmit)}>
                <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
                  <div className="flex items-center gap-2">
                    <ArrowUUpLeft className="text-danger" size={24} />
                    <span>Process Full Refund</span>
                  </div>
                  <p className="text-xs font-normal text-default-500 mt-1">
                    {getItemLabel()}: {itemNumber}
                  </p>
                </ModalHeader>

                <ModalBody className="gap-4">
                  {/* Summary Info */}
                  <div className="bg-danger-50 dark:bg-danger-900/20 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-danger-700 dark:text-danger-500">
                        Total Amount:
                      </span>
                      <span className="font-semibold text-danger-800 dark:text-danger-400">
                        {formatCurrency(totalAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-danger-700 dark:text-danger-500">
                        Amount Paid:
                      </span>
                      <span className="font-semibold text-danger-800 dark:text-danger-400">
                        {formatCurrency(amountPaid)}
                      </span>
                    </div>
                    <div className="flex justify-between text-base pt-2 border-t border-danger-200 dark:border-danger-800">
                      <span className="font-bold text-danger-900 dark:text-danger-300">
                        Refund Amount:
                      </span>
                      <span className="font-bold text-danger-900 dark:text-danger-300">
                        {formatCurrency(amountPaid)}
                      </span>
                    </div>
                  </div>

                  <Alert
                    className="w-full text-xs"
                    color="danger"
                    variant="flat"
                    title={`This will refund the full amount paid (
                    ${formatCurrency(amountPaid)}).
                    ${getItemLabel()} status will be updated to REFUNDED.`}
                  />

                  <TextInput
                    isRequired
                    control={methods.control}
                    description="Provide a clear reason for this refund"
                    label="Refund Reason"
                    name="refundReason"
                    placeholder="e.g., Customer returned goods, Cancelled order, Quality issue..."
                  />

                  <TextInput
                    control={methods.control}
                    label="Refund Date"
                    name="refundDate"
                    type="datetime-local"
                  />
                </ModalBody>

                <ModalFooter>
                  <Button
                    isDisabled={isSubmitting || isLoading}
                    variant="light"
                    onPress={handleClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="danger"
                    isLoading={isSubmitting || isLoading}
                    type="submit"
                  >
                    Process Refund
                  </Button>
                </ModalFooter>
              </form>
            </FormProvider>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
