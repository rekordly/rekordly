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
} from '@heroui/react';
import { Plus, CurrencyCircleDollar } from '@phosphor-icons/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';

import { Purchase } from '@/types/purchases';
import { NumberInput, TextInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { usePurchaseStore } from '@/store/purchase-store';
import { useApi } from '@/hooks/useApi';
import { RecordPaymentSchema } from '@/lib/validations/purchases';
import { paymentMethods } from '@/config/constant';

interface AddPurchasePaymentProps {
  purchase: Purchase;
}

export function AddPurchasePayment({ purchase }: AddPurchasePaymentProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { updatePurchase } = usePurchaseStore();

  const methods = useForm({
    resolver: zodResolver(RecordPaymentSchema) as Resolver<any>,
    defaultValues: {
      amount: purchase.balance,
      paymentMethod: 'BANK_TRANSFER',
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

  const { post, isLoading } = useApi({
    addToast,
    showSuccessToast: true,
    onSuccess: data => {
      const updatedPurchase = data.purchase;

      if (updatedPurchase) {
        updatePurchase(purchase.id, updatedPurchase);

        const newBalance = updatedPurchase.balance || 0;

        reset({
          amount: newBalance,
          paymentMethod: 'BANK_TRANSFER',
          reference: '',
          notes: '',
        });
      }

      handleClose();
    },
  });

  const amount = watch('amount');
  const balance = purchase.balance - (amount || 0);

  const onSubmit = async (data: any) => {
    try {
      await post(`/purchases/${purchase.id}/payment`, data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isFullyPaid = purchase.balance === 0;
  const hasPayments = purchase.payments && purchase.payments.length > 0;

  if (isFullyPaid) return null;

  return (
    <>
      <Button
        className="w-full font-semibold"
        color={hasPayments ? 'primary' : 'secondary'}
        size="md"
        startContent={<Plus size={16} weight="bold" />}
        variant="shadow"
        onPress={onOpen}
      >
        {hasPayments ? 'Add Payment' : 'Record Payment'}
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
                    <CurrencyCircleDollar
                      className="text-secondary"
                      size={24}
                    />
                    <span>Add Payment</span>
                  </div>
                  <p className="text-xs font-normal text-default-500 mt-1">
                    Purchase: {purchase.purchaseNumber} • Balance:{' '}
                    {formatCurrency(purchase.balance)}
                  </p>
                </ModalHeader>

                <ModalBody className="gap-4">
                  <NumberInput
                    isRequired
                    control={methods.control}
                    description={
                      amount !== undefined && amount !== purchase.balance
                        ? balance > 0
                          ? `Balance: ${formatCurrency(balance)} remaining`
                          : balance < 0
                            ? `Overpayment: ${formatCurrency(Math.abs(balance))}`
                            : 'Full payment'
                        : ''
                    }
                    label="Amount Paid"
                    max={purchase.balance}
                    min={0.01}
                    name="amount"
                    placeholder="0.00"
                    startContent={
                      <span className="text-default-400 text-sm">₦</span>
                    }
                    step={0.01}
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
                    control={methods.control}
                    description="Optional: Add payment reference or transaction ID"
                    label="Reference/Transaction ID"
                    name="reference"
                    placeholder="e.g., TXN123456"
                  />

                  <TextInput
                    control={methods.control}
                    label="Notes"
                    name="notes"
                    placeholder="Add any additional notes..."
                  />

                  {balance > 0 && amount !== undefined && amount > 0 && (
                    <Chip
                      className="w-full text-xs"
                      color="warning"
                      variant="flat"
                    >
                      ⚠️ Partial payment: {formatCurrency(balance)} balance
                      remaining
                    </Chip>
                  )}

                  {balance < 0 && amount !== undefined && (
                    <Chip
                      className="w-full text-xs"
                      color="danger"
                      variant="flat"
                    >
                      ⚠️ Overpayment: {formatCurrency(Math.abs(balance))} excess
                    </Chip>
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
                    isLoading={isSubmitting || isLoading}
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
