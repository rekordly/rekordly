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
import { z } from 'zod';
import axios from 'axios';
import { ConvertToSalesType, Invoice } from '@/types/invoice';
import { NumberInput, TextInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { useInvoiceStore } from '@/store/invoiceStore';
import { convertToSalesSchema } from '@/lib/validations/invoice';

interface ConvertToSalesProps {
  invoice: Invoice;
}

export default function ConvertToSales({ invoice }: ConvertToSalesProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const methods = useForm<ConvertToSalesType>({
    resolver: zodResolver(convertToSalesSchema),
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
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = methods;

  const amountPaid = watch('amountPaid');

  // ✅ Fixed: Calculate balance based on current outstanding amount minus amount being paid
  const outstandingBalance = !invoice.sale
    ? invoice.totalAmount
    : invoice.sale?.balance;
  const balance = outstandingBalance - (amountPaid || 0);

  const onSubmit = async (data: ConvertToSalesType) => {
    try {
      const response = await axios.post(
        `/api/invoices/${invoice.id}/convert`,
        data
      );

      if (response.data.success) {
        // ✅ Fetch updated invoice data
        await useInvoiceStore.getState().fetchInvoices();

        // ✅ Get the updated invoice to reset form with latest balance
        const updatedInvoice = useInvoiceStore
          .getState()
          .invoices.find(inv => inv.id === invoice.id);

        // Reset form with updated values
        reset({
          amountPaid: updatedInvoice?.sale?.balance || 0,
          paymentMethod: 'BANK_TRANSFER',
          reference: '',
          notes: '',
          paymentDate: new Date().toISOString().split('T')[0],
        });

        addToast({
          title: 'Success',
          description:
            response.data.message || 'Invoice converted to sales successfully!',
          color: 'success',
        });

        handleClose();
      }
    } catch (error) {
      console.error('Error converting invoice:', error);

      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.message ||
          'Failed to convert invoice. Please try again.';

        addToast({
          title: 'Error',
          description: errorMessage,
          color: 'danger',
        });

        // Handle validation errors
        if (error.response?.data?.errors) {
          console.error('Validation errors:', error.response.data.errors);
        }
      } else {
        addToast({
          title: 'Error',
          description: 'An unexpected error occurred',
          color: 'danger',
        });
      }
    }
  };

  // ✅ Handle modal close with form reset
  const handleClose = () => {
    reset();
    onClose();
  };

  // ✅ Payment method options
  const paymentMethods = [
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'CARD', label: 'Card Payment' },
    { value: 'MOBILE_MONEY', label: 'Mobile Money' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'OTHER', label: 'Other' },
  ];

  // Check if invoice is fully paid
  const isFullyPaid = invoice.sale && invoice.sale.balance === 0;
  const isConverted = !!invoice.sale;

  // Don't show button if fully paid
  if (isFullyPaid) return null;

  return (
    <>
      <Button
        size="md"
        color={isConverted ? 'primary' : 'secondary'}
        variant="shadow"
        startContent={<Plus size={16} weight="bold" />}
        onPress={onOpen}
        className="w-full font-semibold"
      >
        {isConverted ? 'Add Payment' : 'Convert to Sales'}
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
                    <span>Convert Invoice to Sales</span>
                  </div>
                  <p className="text-xs font-normal text-default-500 mt-1">
                    Invoice: {invoice.invoiceNumber} • Total:{' '}
                    {formatCurrency(invoice.totalAmount)}
                  </p>
                </ModalHeader>

                <ModalBody className="gap-4">
                  {/* Amount Paid */}
                  <NumberInput<ConvertToSalesType>
                    name="amountPaid"
                    control={methods.control}
                    label="Amount Paid"
                    placeholder="0.00"
                    min={0}
                    max={outstandingBalance}
                    step={0.01}
                    isRequired
                    startContent={
                      <span className="text-default-400 text-sm">₦</span>
                    }
                    description={
                      balance !== outstandingBalance && amountPaid
                        ? `Balance: ${formatCurrency(Math.abs(balance))} ${balance > 0 ? 'remaining' : 'overpaid'}`
                        : undefined
                    }
                  />

                  {/* Payment Method */}
                  <DropdownInput<ConvertToSalesType>
                    name="paymentMethod"
                    control={methods.control}
                    label="Payment Method"
                    placeholder="Select payment method"
                    items={paymentMethods}
                    isRequired
                  />

                  {/* Payment Date */}
                  <TextInput<ConvertToSalesType>
                    name="paymentDate"
                    control={methods.control}
                    label="Payment Date"
                    placeholder="Select date"
                    type="date"
                  />

                  {/* Reference */}
                  <TextInput<ConvertToSalesType>
                    name="reference"
                    control={methods.control}
                    label="Reference/Transaction ID"
                    placeholder="e.g., TXN123456"
                    description="Optional: Add payment reference or transaction ID"
                  />

                  {/* Notes - ✅ Removed description */}
                  <TextInput<ConvertToSalesType>
                    name="notes"
                    control={methods.control}
                    label="Notes"
                    placeholder="Add any additional notes..."
                  />

                  {/* Balance Warning */}
                  {balance > 0 && amountPaid && (
                    <Chip color="warning" variant="flat" className="w-full">
                      ⚠️ Partial payment: {formatCurrency(balance)} balance
                      remaining
                    </Chip>
                  )}

                  {balance < 0 && amountPaid && (
                    <Chip color="danger" variant="flat" className="w-full">
                      ⚠️ Overpayment: {formatCurrency(Math.abs(balance))} excess
                    </Chip>
                  )}
                </ModalBody>

                <ModalFooter>
                  <Button
                    variant="light"
                    onPress={handleClose}
                    isDisabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    color={isConverted ? 'primary' : 'secondary'}
                    type="submit"
                    isLoading={isSubmitting}
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
