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
import { ArrowUUpLeft } from '@phosphor-icons/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { useEffect } from 'react';

import { TextInput, NumberInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { useApi } from '@/hooks/useApi';
import { RefundSchema } from '@/lib/validations/general';
import { RefundType } from '@/types';
import { paymentMethods } from '@/config/constant';

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
      refundAmount: amountPaid,
      refundReason: '',
      refundDate: new Date(),
    },
    mode: 'all',
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
    watch,
    setValue,
  } = methods;

  const refundAmount = watch('refundAmount');

  // Update refund amount when amountPaid changes
  useEffect(() => {
    if (isOpen) {
      setValue('refundAmount', amountPaid);
    }
  }, [isOpen, amountPaid, setValue]);

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
        Process Refund
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
                    <span>Process Refund</span>
                  </div>
                  <p className="text-xs font-normal text-default-500 mt-1">
                    {getItemLabel()}: {itemNumber}
                  </p>
                </ModalHeader>

                <ModalBody className="gap-4">
                  {/* Compact Summary */}
                  <div className="text-xs text-default-600 space-y-1">
                    <p>
                      Total:{' '}
                      <span className="font-semibold">
                        {formatCurrency(totalAmount)}
                      </span>{' '}
                      • Amount Paid:{' '}
                      <span className="font-semibold">
                        {formatCurrency(amountPaid)}
                      </span>{' '}
                      • Refund:{' '}
                      <span className="font-semibold text-danger">
                        {formatCurrency(refundAmount || 0)}
                      </span>
                    </p>
                  </div>

                  <NumberInput
                    isRequired
                    control={methods.control}
                    description={`Maximum: ${formatCurrency(amountPaid)}`}
                    label="Refund Amount"
                    name="refundAmount"
                    placeholder="0.00"
                    startContent={
                      <span className="text-default-400 text-sm">₦</span>
                    }
                    step={0.01}
                    min={0.01}
                    max={amountPaid}
                  />

                  <DropdownInput
                    isRequired
                    control={methods.control}
                    items={paymentMethods}
                    label="Payment Method"
                    name="paymentMethod"
                    placeholder="Select payment method"
                  />

                  <TextInput
                    isRequired
                    control={methods.control}
                    label="Refund Reason"
                    name="refundReason"
                    placeholder="e.g., Customer returned goods, Cancelled order..."
                  />

                  <TextInput
                    control={methods.control}
                    description="Optional: Add payment reference or transaction ID"
                    label="Reference/Transaction ID"
                    name="reference"
                    placeholder="e.g., TXN123456"
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
