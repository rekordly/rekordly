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
import { InvoiceFormType } from '@/types/invoices';

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
        size="md"
        color={hasPayments ? 'primary' : 'secondary'}
        variant="shadow"
        startContent={<Plus size={16} weight="bold" />}
        onPress={onOpen}
        className="w-full font-semibold"
      >
        {hasPayments ? 'Add Payment' : 'Record Payment'}
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        placement="center"
        backdrop="blur"
        size="lg"
      >
        <ModalContent>
          {() => (
            <FormProvider {...methods}>
              <form onSubmit={handleSubmit(onSubmit)}>
                <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
                  <div className="flex items-center gap-2">
                    <CurrencyCircleDollar
                      size={24}
                      className="text-secondary"
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
                    name="amountPaid"
                    control={methods.control}
                    label="amountPaid Paid"
                    placeholder="0.00"
                    min={0} // ✅ Allow 0
                    max={quotation.balance}
                    step={0.01}
                    isRequired
                    startContent={
                      <span className="text-default-400 text-sm">₦</span>
                    }
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
                  />

                  <DropdownInput<AddPaymentType>
                    name="paymentMethod"
                    control={methods.control}
                    label="Payment Method"
                    placeholder="Select payment method"
                    items={paymentMethods}
                    isRequired
                  />

                  <TextInput<AddPaymentType>
                    name="paymentDate"
                    control={methods.control}
                    label="Payment Date"
                    placeholder="Select date"
                    type="date"
                  />

                  <TextInput<AddPaymentType>
                    name="reference"
                    control={methods.control}
                    label="Reference/Transaction ID"
                    placeholder="e.g., TXN123456"
                    description="Optional: Add payment reference or transaction ID"
                  />

                  <TextInput<AddPaymentType>
                    name="notes"
                    control={methods.control}
                    label="Notes"
                    placeholder="Add any additional notes..."
                  />

                  {balance > 0 &&
                    amountPaid !== undefined &&
                    amountPaid > 0 && (
                      <Chip
                        color="warning"
                        variant="flat"
                        className="w-full text-xs"
                      >
                        ⚠️ Partial payment: {formatCurrency(balance)} balance
                        remaining
                      </Chip>
                    )}

                  {balance < 0 && amountPaid !== undefined && (
                    <Chip
                      color="danger"
                      variant="flat"
                      className="w-full text-xs"
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
                    variant="light"
                    onPress={handleClose}
                    isDisabled={isSubmitting || isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    type="submit"
                    isLoading={isSubmitting || isLoading}
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
