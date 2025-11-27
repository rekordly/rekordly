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
import { Plus, CreditCard } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';

import { TextInput, NumberInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { useApi } from '@/hooks/useApi';
import { addPaymentSchema } from '@/lib/validations/general';
import { AddPaymentType } from '@/types';
import { paymentMethods } from '@/config/constant';
import { useEffect } from 'react';

interface AddPaymentModalProps {
  entityType: 'sale' | 'purchase' | 'quotation';
  entityId: string;
  entityNumber: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  apiEndpoint?: string;
  onSuccess?: (data: any) => void;
  buttonText?: string;
  buttonClassName?: string;
}

export function AddPaymentModal({
  entityType,
  entityId,
  entityNumber,
  totalAmount,
  amountPaid,
  balance,
  apiEndpoint,
  onSuccess,
  buttonText = 'Add Payment',
  buttonClassName = 'w-full font-semibold',
}: AddPaymentModalProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const initialAmount = balance > 0 ? balance : 0;
  
  const methods = useForm<AddPaymentType>({
    resolver: zodResolver(addPaymentSchema) as Resolver<AddPaymentType>,
    defaultValues: {
      amountPaid: initialAmount,
      paymentMethod: 'BANK_TRANSFER',
      paymentDate: new Date().toISOString().slice(0, 16),
      reference: '',
      notes: '',
    },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
    watch,
} = methods;

  useEffect(() => {
    if (isOpen) {
      reset({
        amountPaid: initialAmount,
        paymentMethod: 'BANK_TRANSFER',
        paymentDate: new Date().toISOString().slice(0, 16),
        reference: '',
        notes: '',
      });
    }
  }, [isOpen, balance]);

  const amount = watch('amountPaid');
  const newBalance = balance - (amount || 0);
  
  const overPayment = (amount > 0 && newBalance < 0)

  const { post, isLoading } = useApi({
    addToast,
    showSuccessToast: true,
    onSuccess: data => {
      if (onSuccess) onSuccess(data);
      handleClose();
    },
    onError: (error: any) => {
      if (error?.message?.includes('overpayment') || newBalance < 0) {
        addToast({
          title: 'Payment Error',
          description: `Overpayment of ${formatCurrency(
            Math.abs(newBalance)
          )} detected.`,
          color: 'danger',
        });
      }
    },
  });

  const onSubmit = async (data: AddPaymentType) => {
    console.log({
      url: `/${entityType}s/${entityId}/payments`,
    });

    const endpoint = apiEndpoint || `/${entityType}s/${entityId}/payment`;
    await post(endpoint, data);
  };

  const handleClose = () => {
    reset({
      amountPaid: balance > 0 ? balance : 0,
      paymentMethod: 'BANK_TRANSFER',
      paymentDate: new Date().toISOString().slice(0, 16),
      reference: '',
      notes: '',
    });
    onClose();
  };

  const getEntityLabel = () => {
    if (entityType === 'sale') return 'Sale';
    if (entityType === 'purchase') return 'Purchase';
    if (entityType === 'quotation') return 'Quotation';
    return 'Transaction';
  };

  const getPaymentDescription = () => {
    if (amount > 0) {
      if (newBalance > 0)
        return `Balance remaining: ${formatCurrency(newBalance)}`;
      if (newBalance < 0)
        return `Overpayment: ${formatCurrency(Math.abs(newBalance))}`;
      return 'Full payment';
    }
    return `Current balance: ${formatCurrency(balance)}`;
  };

  return (
    <>
      <Button
        className={buttonClassName}
        color="primary"
        size="md"
        startContent={<Plus size={16} />}
        variant="flat"
        onPress={onOpen}
      >
        {buttonText}
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
                    <CreditCard className="text-primary" size={24} />
                    <span>Add Payment</span>
                  </div>
                  <p className="text-xs text-default-500 mt-1">
                    {getEntityLabel()}: {entityNumber}
                  </p>
                </ModalHeader>

                <ModalBody className="gap-4">
                  {/* FIX 3 — No HTML validation conflict */}
                  <NumberInput
                    isRequired
                    control={methods.control}
                    description={getPaymentDescription()}
                    label="Payment Amount"
                    name="amountPaid"
                    placeholder="0.00"
                    step={0.01}
                    min={0} // no 0 allowed
                    startContent={
                      <span className="text-default-400 text-sm">₦</span>
                    }
                  />

                  {amount > 0 && newBalance < 0 && (
                    <div className="bg-danger-50 p-3 rounded-lg border border-danger-200">
                      <p className="text-xs text-danger-700 font-medium">
                        ⚠️ Overpayment: {formatCurrency(Math.abs(newBalance))}
                      </p>
                    </div>
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
                    control={methods.control}
                    label="Payment Date"
                    name="paymentDate"
                    type="datetime-local"
                  />

                  <TextInput
                    control={methods.control}
                    label="Reference (Optional)"
                    name="reference"
                    placeholder="e.g., TXN123456"
                  />

                  <TextInput
                    control={methods.control}
                    label="Notes (Optional)"
                    name="notes"
                    placeholder="Additional info"
                  />

                  {amount > 0 && newBalance === 0 && (
                    <div className="bg-success-50 p-3 rounded-lg border border-success-200">
                      <p className="text-xs text-success-700 font-medium">
                        ✓ Full payment – balance cleared
                      </p>
                    </div>
                  )}

                  {amount > 0 && newBalance > 0 && (
                    <div className="bg-warning-50 p-3 rounded-lg border border-warning-200">
                      <p className="text-xs text-warning-700 font-medium">
                        ℹ️ Partial payment – {formatCurrency(newBalance)}{' '}
                        remaining
                      </p>
                    </div>
                  )}
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
                    isDisabled={isSubmitting || isLoading || overPayment}
                    isLoading={isSubmitting || isLoading }
                    type="submit"
                  >
                    Add Payment
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
