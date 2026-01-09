'use client';

import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  addToast,
  Chip,
} from '@heroui/react';
import { PencilSimple } from '@phosphor-icons/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { useEffect } from 'react';

import { NumberInput, TextInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { useApi } from '@/hooks/useApi';
import { addPaymentSchema } from '@/lib/validations/general';
import { AddPaymentType, PaymentRecord } from '@/types';
import { paymentMethods } from '@/config/constant';

interface EditPaymentModalProps {
  payment: PaymentRecord;
  totalAmount: number;
  currentTotalPaid: number;
  onSuccess?: (data: any) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function EditPaymentModal({
  payment,
  totalAmount,
  currentTotalPaid,
  onSuccess,
  isOpen,
  onClose,
}: EditPaymentModalProps) {
  const otherPaymentsTotal = currentTotalPaid - payment.amount;
  const maxPaymentAmount = totalAmount - otherPaymentsTotal;

  const methods = useForm<AddPaymentType>({
    resolver: zodResolver(addPaymentSchema) as Resolver<AddPaymentType>,
    defaultValues: {
      amountPaid: payment.amount,
      paymentMethod: payment.paymentMethod,
      paymentDate: new Date(payment.paymentDate).toISOString().slice(0, 16),
      reference: payment.reference || '',
      notes: payment.notes || '',
    },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
    watch,
  } = methods;

  const watchAmount = watch('amountPaid');
  const willExceedTotal = watchAmount > maxPaymentAmount;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      reset({
        amountPaid: payment.amount,
        paymentMethod: payment.paymentMethod,
        paymentDate: new Date(payment.paymentDate).toISOString().slice(0, 16),
        reference: payment.reference || '',
        notes: payment.notes || '',
      });
    }
  }, [isOpen, payment, reset]);

  const { patch, isLoading } = useApi({
    addToast,
    showSuccessToast: true,
    onSuccess: data => {
      if (onSuccess) onSuccess(data);
      handleClose();
    },
  });

  const onSubmit = async (data: AddPaymentType) => {
    if (data.amountPaid > maxPaymentAmount) {
      addToast({
        title: 'Invalid Amount',
        description: `Payment amount cannot exceed ${formatCurrency(maxPaymentAmount)}`,
        color: 'danger',
      });
      return;
    }

    try {
      await patch(`/payments/${payment.id}`, data);
    } catch (error) {
      console.error('Edit payment error:', error);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      size="lg"
      onClose={handleClose}
      scrollBehavior="inside"
      classNames={{
        base: 'max-h-[90vh]',
        body: 'py-6',
      }}
    >
      <ModalContent>
        {() => (
          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)}>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <PencilSimple className="text-primary" size={20} />
                  <span className="text-base">Edit Payment</span>
                </div>
                <p className="text-xs font-normal text-default-500">
                  Payment ID: {payment.id.substring(0, 8)}...
                </p>
              </ModalHeader>

              <ModalBody className="gap-3 py-4">
                {/* Info Card */}
                <div className="bg-default-50 p-2.5 rounded-lg space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-default-600">Total Amount:</span>
                    <span className="font-semibold">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-default-200">
                    <span className="font-semibold">Max for This Payment:</span>
                    <span className="font-bold text-primary">
                      {formatCurrency(maxPaymentAmount)}
                    </span>
                  </div>
                </div>

                <NumberInput
                  isRequired
                  control={methods.control}
                  description={`Maximum: ${formatCurrency(maxPaymentAmount)}`}
                  label="Amount"
                  max={maxPaymentAmount}
                  min={0.01}
                  name="amountPaid"
                  placeholder="0.00"
                  startContent={
                    <span className="text-default-400 text-sm">₦</span>
                  }
                  step={0.01}
                />

                {willExceedTotal && (
                  <Chip
                    className="w-full text-xs"
                    color="danger"
                    variant="flat"
                    size="sm"
                  >
                    ⚠️ Amount exceeds maximum (
                    {formatCurrency(maxPaymentAmount)})
                  </Chip>
                )}

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
                  label="Payment Date"
                  name="paymentDate"
                  type="datetime-local"
                />

                <TextInput
                  control={methods.control}
                  description="Optional transaction reference"
                  label="Reference/Transaction ID"
                  name="reference"
                  placeholder="e.g., TXN123456"
                />

                <TextInput
                  control={methods.control}
                  label="Notes"
                  name="notes"
                  placeholder="Add notes..."
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
                  color="primary"
                  isDisabled={willExceedTotal}
                  isLoading={isSubmitting || isLoading}
                  type="submit"
                >
                  Update Payment
                </Button>
              </ModalFooter>
            </form>
          </FormProvider>
        )}
      </ModalContent>
    </Modal>
  );
}
