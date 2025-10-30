'use client';

import { z } from 'zod';
import { addToast, Button } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, Resolver } from 'react-hook-form';
import { useState } from 'react';
import axios from 'axios';

import { CustomerType, InvoiceFormType } from '@/types/invoice';
import { invoiceSchema } from '@/lib/validations/invoice';
import { CustomerDetails } from './CustomerDetails';
import { InvoiceHeading } from './InvoiceHeading';
import { AddItemSection } from './AddItemSection';
import { InvoiceSummary } from './InvoiceSummary';

interface CreateInvoiceFlowProps {
  customers: CustomerType[];
}

export function CreateInvoiceFlow({ customers }: CreateInvoiceFlowProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const methods = useForm<InvoiceFormType>({
    resolver: zodResolver(invoiceSchema) as Resolver<InvoiceFormType>,
    defaultValues: {
      customer: { id: '', name: '', phone: '', email: '' },
      includeVAT: false,
      invoiceTitle: '',
      invoiceDescription: undefined,
      items: [],
      amount: 0,
      vatAmount: 0,
      totalAmount: 0,
    },
    mode: 'onSubmit',
  });

  const { handleSubmit } = methods;

  const onSubmit = async (data: InvoiceFormType) => {
    console.log('Form submitted with data:', data);

    // Validate data
    const parsed = invoiceSchema.safeParse(data);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      addToast({
        title: 'Validation Error',
        description: first?.message ?? 'Invalid invoice data',
        color: 'danger',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await axios.post('/api/invoices', parsed.data);

      addToast({
        title: 'Success',
        description: 'Invoice created successfully',
        color: 'success',
      });

      methods.reset();
    } catch (error) {
      console.error('Error creating invoice:', error);

      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.message || 'Failed to create invoice';
        addToast({
          title: 'Error',
          description: errorMessage,
          color: 'danger',
        });
      } else {
        addToast({
          title: 'Error',
          description:
            error instanceof Error ? error.message : 'Failed to create invoice',
          color: 'danger',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6 w-full overflow-auto"
      >
        <CustomerDetails customers={customers} />
        <InvoiceHeading />
        <AddItemSection />
        <InvoiceSummary />

        <div className="flex gap-3 justify-end pt-4">
          <Button
            type="submit"
            color="primary"
            radius="lg"
            size="lg"
            isLoading={isSubmitting}
            isDisabled={isSavingDraft}
            className="px-6"
          >
            Create Invoice
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
