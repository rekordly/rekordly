'use client';

import React, { useState, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/modal';
import { Button } from '@heroui/button';
import { Skeleton } from '@heroui/skeleton';
import { addToast } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, Resolver } from 'react-hook-form';

import { CustomerType, InvoiceFormType } from '@/types/invoice';
import { invoiceSchema } from '@/lib/validations/invoice';
import { CustomerDetails } from '@/components/dashboard/invoice/CustomerDetails';
import { InvoiceHeading } from '@/components/dashboard/invoice/InvoiceHeading';
import { AddItemSection } from '@/components/dashboard/invoice/AddItemSection';
import { InvoiceSummary } from '@/components/dashboard/invoice/InvoiceSummary';
import { useCustomerStore } from '@/store/customerStore';
import { api } from '@/lib/axios';
import { InvoiceLoadingSkeleton } from '../dashboard/invoice/InvoiceLoadingSkeleton';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>; // ✅ Support both sync and async
}

export function CreateInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateInvoiceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // Get customers from store
  const {
    customers,
    loading: loadingCustomers,
    fetchCustomers,
  } = useCustomerStore();

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

  const { handleSubmit, watch, reset } = methods;
  const customerEmail = watch('customer.email');

  // ✅ Fetch customers when modal opens (will use cache if available)
  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
    }
  }, [isOpen, fetchCustomers]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const formData = methods.getValues();
      const draftData = { ...formData, status: 'DRAFT' as const };

      const response = await api.post('/invoices', draftData);

      if (draftData.addAsNewCustomer && response.data.customer) {
        await fetchCustomers(true);
      }

      addToast({
        title: 'Success!',
        description: 'Draft saved successfully',
        color: 'success',
      });

      handleClose();

      if (onSuccess) {
        await onSuccess();
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      addToast({
        title: 'Error',
        description: 'Failed to save draft',
        color: 'danger',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const onSubmit = async (data: InvoiceFormType) => {
    setIsSubmitting(true);
    try {
      const hasEmail =
        data.customer?.email && data.customer.email.trim() !== '';
      const invoiceData = {
        ...data,
        status: hasEmail ? ('SENT' as const) : ('DRAFT' as const),
      };

      const response = await api.post('/invoices', invoiceData);

      if (data.addAsNewCustomer && response.data.customer) {
        await fetchCustomers(true);
      }

      addToast({
        title: 'Success!',
        description: hasEmail
          ? 'Invoice created and sent successfully'
          : 'Invoice created successfully',
        color: 'success',
      });

      handleClose();

      if (onSuccess) {
        await onSuccess();
      }
    } catch (error) {
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      placement="auto"
      size="lg"
      backdrop="blur"
      scrollBehavior="inside"
      className="bg-background"
      classNames={{
        // base: 'max-h-auto',
        body: 'pb-8 p-4',
        header: 'border-none',
      }}
    >
      <ModalContent>
        <ModalHeader>
          <div>
            {/* <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">
              Create New Invoice
            </h3>
            <p className="text-xs text-default-500">
              Generate a professional invoice for your customer
            </p> */}
          </div>
        </ModalHeader>
        <ModalBody>
          {loadingCustomers ? (
            <div className="flex items-center justify-center py-12">
              <InvoiceLoadingSkeleton />
            </div>
          ) : (
            <FormProvider {...methods}>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <CustomerDetails customers={customers} />
                <InvoiceHeading />
                <AddItemSection />
                <InvoiceSummary />

                <div className="flex gap-3 justify-end pt-4 border-t border-divider">
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
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
