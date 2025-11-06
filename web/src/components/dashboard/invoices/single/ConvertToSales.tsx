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

import { Invoice } from '@/types/invoices';
import { NumberInput, TextInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { useInvoiceStore } from '@/store/invoiceStore';
import { useApi } from '@/hooks/useApi';
import { paymentMethods } from '@/config/constant';
import { addPaymentSchema } from '@/lib/validations/general';
import { AddPaymentType } from '@/types/index';

interface ConvertToSalesProps {
  invoice: Invoice;
}

export default function ConvertToSales({ invoice }: ConvertToSalesProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { updateInvoice } = useInvoiceStore();

  const methods = useForm<AddPaymentType>({
    resolver: zodResolver(addPaymentSchema),
    defaultValues: {
      amountPaid: !invoice.sale ? invoice.totalAmount : invoice.sale?.balance,
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
      const updatedInvoice = data.invoice;

      if (updatedInvoice) {
        updateInvoice(invoice.id, updatedInvoice);

        const newBalance = updatedInvoice.sale?.balance || 0;

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

  const outstandingBalance = !invoice.sale
    ? invoice.totalAmount
    : invoice.sale?.balance;
  const balance = outstandingBalance - (amountPaid || 0);

  const onSubmit = async (data: AddPaymentType) => {
    console.log(data);
    try {
      await post(`/invoices/${invoice.id}/convert`, data);
    } catch (error) {}
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isFullyPaid = invoice.sale && invoice.sale.balance === 0;
  const isConverted = !!invoice.sale;

  if (isFullyPaid) return null;

  return (
    <>
      <Button
        className="w-full font-semibold"
        color={isConverted ? 'primary' : 'secondary'}
        size="md"
        startContent={<Plus size={16} weight="bold" />}
        variant="shadow"
        onPress={onOpen}
      >
        {isConverted ? 'Add Payment' : 'Convert to Sales'}
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
                    <span>Convert Invoice to Sales</span>
                  </div>
                  <p className="text-xs font-normal text-default-500 mt-1">
                    Invoice: {invoice.invoiceNumber} • Total:{' '}
                    {formatCurrency(invoice.totalAmount)}
                  </p>
                </ModalHeader>

                <ModalBody className="gap-4">
                  <NumberInput<AddPaymentType>
                    isRequired
                    control={methods.control}
                    description={
                      balance !== outstandingBalance && amountPaid
                        ? `Balance: ${formatCurrency(Math.abs(balance))} ${balance > 0 ? 'remaining' : 'overpaid'}`
                        : undefined
                    }
                    label="Amount Paid"
                    max={outstandingBalance}
                    min={0}
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
                    type="datetime-local"
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

                  {balance > 0 && amountPaid && (
                    <Chip className="w-full" color="warning" variant="flat">
                      ⚠️ Partial payment: {formatCurrency(balance)} balance
                      remaining
                    </Chip>
                  )}

                  {balance < 0 && amountPaid && (
                    <Chip className="w-full" color="danger" variant="flat">
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
                    color={isConverted ? 'primary' : 'secondary'}
                    isLoading={isSubmitting || isLoading}
                    type="submit"
                  >
                    {isConverted ? 'Add Payment' : 'Convert to Sales'}
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
