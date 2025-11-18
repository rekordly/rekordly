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

import { Sale } from '@/types/sales';
import { NumberInput, TextInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { useSaleStore } from '@/store/saleStore';
import { useApi } from '@/hooks/useApi';
import { addPaymentSchema } from '@/lib/validations/general';
import { AddPaymentType } from '@/types';
import { paymentMethods } from '@/config/constant';

interface AddSalePaymentProps {
  sale: Sale;
}

export function AddSalePayment({ sale }: AddSalePaymentProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { updateSale } = useSaleStore();

  const methods = useForm<AddPaymentType>({
    resolver: zodResolver(addPaymentSchema) as Resolver<AddPaymentType>,
    defaultValues: {
      amountPaid: sale.balance,
      paymentMethod: 'BANK_TRANSFER',
      reference: '',
      notes: '',
      paymentDate: new Date().toISOString().split('T')[0],
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
      const updatedSale = data.sale;

      if (updatedSale) {
        updateSale(sale.id, updatedSale);

        const newBalance = updatedSale.balance || 0;

        reset({
          amountPaid: newBalance,
          paymentMethod: 'BANK_TRANSFER',
          reference: '',
          notes: '',
          paymentDate: new Date().toISOString().split('T')[0],
        });
      }

      handleClose();
    },
  });

  const amountPaid = watch('amountPaid');
  const balance = sale.balance - (amountPaid || 0);

  const onSubmit = async (data: AddPaymentType) => {
    try {
      await post(`/sales/${sale.id}/payment`, data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isFullyPaid = sale.balance === 0;
  const hasPayments = sale.payments && sale.payments.length > 0;

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
                    Sale: {sale.receiptNumber} • Balance:{' '}
                    {formatCurrency(sale.balance)}
                  </p>
                </ModalHeader>

                <ModalBody className="gap-4">
                  <NumberInput
                    isRequired
                    control={methods.control}
                    description={
                      amountPaid !== undefined && amountPaid !== sale.balance
                        ? balance > 0
                          ? `Balance: ${formatCurrency(balance)} remaining`
                          : balance < 0
                            ? `Overpayment: ${formatCurrency(Math.abs(balance))}`
                            : 'Full payment'
                        : ''
                    }
                    label="Amount Paid"
                    max={sale.balance}
                    min={0.01}
                    name="amountPaid"
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
                    label="Payment Date"
                    name="paymentDate"
                    placeholder="Select date"
                    type="date"
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

                  {balance > 0 &&
                    amountPaid !== undefined &&
                    amountPaid > 0 && (
                      <Chip
                        className="w-full text-xs"
                        color="warning"
                        variant="flat"
                      >
                        ⚠️ Partial payment: {formatCurrency(balance)} balance
                        remaining
                      </Chip>
                    )}

                  {balance < 0 && amountPaid !== undefined && (
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
