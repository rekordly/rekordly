'use client';

import { z } from 'zod';
import { addToast, Button } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, Resolver } from 'react-hook-form';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

import { CustomerType, InvoiceFormType } from '@/types/invoice';
import { invoiceSchema } from '@/lib/validations/invoice';
import { CustomerDetails } from './CustomerDetails';
import { InvoiceHeading } from './InvoiceHeading';
import { AddItemSection } from './AddItemSection';
import { InvoiceSummary } from './InvoiceSummary';
import { useApi } from '@/hooks/useApi';

interface CreateInvoiceFlowProps {
  customers: CustomerType[];
}

export function CreateInvoiceFlow({ customers }: CreateInvoiceFlowProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const { data: session } = useSession();

  const methods = useForm<InvoiceFormType>({
    resolver: zodResolver(invoiceSchema) as Resolver<InvoiceFormType>,
    defaultValues: {
      customer: { id: '', name: '', phone: '', email: '' },
      addAsNewCustomer: false,
      includeVAT: false,
      invoiceTitle: '',
      invoiceDescription: undefined,
      dueDate: undefined,
      items: [],
      amount: 0,
      vatAmount: 0,
      totalAmount: 0,
      status: 'DRAFT',
    },
    mode: 'all',
  });

  const { handleSubmit, watch } = methods;
  const customerEmail = watch('customer.email');

  const { post } = useApi({
    addToast,
    onSuccess: async data => {
      console.log(data);
      // addToast({
      //   title: 'Success!',
      //   description: data.message || 'Invoice created successfully!',
      //   color: 'success',
      // });
      methods.reset();
    },
  });

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);

    try {
      const formData = methods.getValues();
      const draftData = { ...formData, status: 'DRAFT' as const };

      await post('/invoices', draftData);
    } catch (error) {
      // Error handled by useApi
    } finally {
      setIsSavingDraft(false);
    }
  };

  const onSubmit = async (data: InvoiceFormType) => {
    setIsSubmitting(true);

    try {
      // Determine status based on customer email
      const hasEmail =
        data.customer?.email && data.customer.email.trim() !== '';
      const invoiceData = {
        ...data,
        status: hasEmail ? ('SENT' as const) : ('DRAFT' as const),
      };

      await post('/invoices', invoiceData);
    } catch (error) {
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6 w-full max-w-5xl mx-auto overflow-auto"
      >
        <CustomerDetails customers={customers} />
        <InvoiceHeading />
        <AddItemSection />
        <InvoiceSummary />

        <div className="flex gap-3 justify-end pt-4">
          <Button
            type="button"
            color="default"
            variant="bordered"
            radius="lg"
            size="lg"
            onPress={handleSaveDraft}
            isLoading={isSavingDraft}
            isDisabled={isSubmitting}
            className="px-6"
          >
            Save as Draft
          </Button>

          <Button
            type="submit"
            color="primary"
            radius="lg"
            size="lg"
            isLoading={isSubmitting}
            isDisabled={isSavingDraft}
            className="px-6"
          >
            {customerEmail && customerEmail.trim() !== ''
              ? 'Create & Send Invoice'
              : 'Create Invoice'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
