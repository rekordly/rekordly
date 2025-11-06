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
import { FormProvider, useForm, Resolver } from 'react-hook-form';

import { Quotation } from '@/types/quotations';
import { NumberInput, TextInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { useQuotationStore } from '@/store/quotationStore';
import { useApi } from '@/hooks/useApi';
import { addPaymentSchema } from '@/lib/validations/general';
import { AddPaymentType } from '@/types';
import { paymentMethods } from '@/config/constant';

interface AddQuotationPaymentProps {
  quotation: Quotation;
}

export default function AddQuotationPayment({
  quotation,
}: AddQuotationPaymentProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { updateQuotation } = useQuotationStore();

  const methods = useForm<AddPaymentType>({
    resolver: zodResolver(addPaymentSchema) as Resolver<AddPaymentType>,
    defaultValues: {
      amountPaid: quotation.balance,
      paymentMethod: 'BANK_TRANSFER',
      reference: '',
      notes: '',
      paymentDate: new Date().toISOString().split('T')[0],
    },
    mode: 'onSubmit',
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
      const updatedQuotation = data.quotation;

      if (updatedQuotation) {
        updateQuotation(quotation.id, updatedQuotation);

        const newBalance = updatedQuotation.balance || 0;

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
  const balance = quotation.balance - (amountPaid || 0);

  const onSubmit = async (data: AddPaymentType) => {
    try {
      await post(`/quotations/${quotation.id}/convert`, data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isFullyPaid = quotation.balance === 0;
  const hasPayments = quotation.payments && quotation.payments.length > 0;

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
                    Quotation: {quotation.quotationNumber} • Balance:{' '}
                    {formatCurrency(quotation.balance)}
                  </p>
                </ModalHeader>

                <ModalBody className="gap-4">
                  <NumberInput<AddPaymentType>
                    isRequired
                    control={methods.control}
                    description={
                      amountPaid !== undefined &&
                      amountPaid !== quotation.balance
                        ? balance > 0
                          ? `Balance: ${formatCurrency(balance)} remaining`
                          : balance < 0
                            ? `Overpayment: ${formatCurrency(Math.abs(balance))}`
                            : 'Full payment'
                        : 'Enter 0 to record without payment'
                    }
                    label="amountPaid Paid"
                    max={quotation.balance}
                    min={0} // ✅ Allow 0
                    name="amountPaid"
                    placeholder="0.00"
                    startContent={
                      <span className="text-default-400 text-sm">₦</span>
                    }
                    step={0.01}
                  />

                  <DropdownInput<AddPaymentType>
                    isRequired
                    control={methods.control}
                    items={paymentMethods}
                    label="Payment Method"
                    name="paymentMethod"
                    placeholder="Select payment method"
                  />

                  <TextInput<AddPaymentType>
                    control={methods.control}
                    label="Payment Date"
                    name="paymentDate"
                    placeholder="Select date"
                    type="date"
                  />

                  <TextInput<AddPaymentType>
                    control={methods.control}
                    description="Optional: Add payment reference or transaction ID"
                    label="Reference/Transaction ID"
                    name="reference"
                    placeholder="e.g., TXN123456"
                  />

                  <TextInput<AddPaymentType>
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

                  {amountPaid === 0 && (
                    <div className="text-primary bg-primary-100 p-2 px-3 rounded-2xl text-xs">
                      <span>
                        Recording quotation without payment (workmanship income
                        will be recorded)
                      </span>
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
