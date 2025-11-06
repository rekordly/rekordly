'use client';

import React, { useState, useEffect } from 'react';
import { Drawer, DrawerBody, DrawerContent, DrawerHeader } from '@heroui/react';
import { Button } from '@heroui/button';
import { addToast } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, Resolver } from 'react-hook-form';

import { InvoiceFormType } from '@/types/invoices';
import { invoiceSchema } from '@/lib/validations/invoices';
import { CustomerDetails } from '@/components/dashboard/layout/CustomerDetails';
import { InvoiceHeading } from '@/components/dashboard/invoices/InvoiceHeading';
import { AddItemSection } from '@/components/dashboard/invoices/AddItemSection';
import { InvoiceSummary } from '@/components/dashboard/invoices/InvoiceSummary';
import { useCustomerStore } from '@/store/customerStore';
import { useInvoiceStore } from '@/store/invoiceStore';
import { api } from '@/lib/axios';
import { FormSkeleton } from '@/components/skeleton/FormSkeleton';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  invoiceId?: string | null;
}

export function CreateInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
  invoiceId,
}: CreateInvoiceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const {
    customers,
    loading: loadingCustomers,
    fetchCustomers,
    addCustomer,
  } = useCustomerStore();
  const { allInvoices, updateInvoice, addInvoice } = useInvoiceStore();

  const isEditMode = !!invoiceId;

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

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();

      if (isEditMode && invoiceId) {
        const invoice = allInvoices.find(inv => inv.id === invoiceId);

        if (invoice) {
          reset({
            customer: invoice.customerId
              ? {
                  id: invoice.customerId,
                  name: invoice.customer?.name || '',
                  phone: invoice.customer?.phone || '',
                  email: invoice.customer?.email || '',
                }
              : {
                  id: '',
                  name: invoice.customerName || '',
                  phone: invoice.customerPhone || '',
                  email: invoice.customerEmail || '',
                },
            addAsNewCustomer: false,
            includeVAT: invoice.includeVAT,
            invoiceTitle: invoice.title || '',
            invoiceDescription: invoice.description || undefined,
            dueDate: invoice.dueDate ? new Date(invoice.dueDate) : undefined,
            items: invoice.items || [],
            amount: invoice.amount,
            vatAmount: invoice.vatAmount || 0,
            totalAmount: invoice.totalAmount,
            status: invoice.status,
          });
        }
      } else {
        reset({
          customer: { id: '', name: '', phone: '', email: '' },
          addAsNewCustomer: false,
          includeVAT: false,
          invoiceTitle: '',
          invoiceDescription: '',
          dueDate: undefined,
          items: [],
          amount: 0,
          vatAmount: 0,
          totalAmount: 0,
          status: 'DRAFT',
        });
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    // reset();
    onClose();
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const formData = methods.getValues();
      const draftData = { ...formData, status: 'DRAFT' as const };

      const response = await api.post('/invoices', draftData);

      addToast({
        title: 'Success!',
        description: 'Draft saved successfully',
        color: 'success',
      });

      if (draftData.addAsNewCustomer && response.data.customer) {
        addCustomer(response.data.customer);
      }

      handleClose();

      if (onSuccess) {
        await onSuccess();
      }
    } catch (error) {
    } finally {
      setIsSavingDraft(false);
    }
  };

  const onSubmit = async (data: InvoiceFormType) => {
    setIsSubmitting(true);

    try {
      if (isEditMode && invoiceId) {
        const response = await api.patch(`/invoices/${invoiceId}`, data);

        updateInvoice(invoiceId, response.data.invoice);

        addToast({
          title: 'Success!',
          description: 'Invoice updated successfully',
          color: 'success',
        });

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }
      } else {
        const hasEmail =
          data.customer?.email && data.customer.email.trim() !== '';
        const invoiceData = {
          ...data,
          status: hasEmail ? ('SENT' as const) : ('DRAFT' as const),
        };

        const response = await api.post('/invoices', invoiceData);

        if (response.data.invoice) {
          addInvoice(response.data.invoice);
        }

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }

        addToast({
          title: 'Success!',
          description: hasEmail
            ? 'Invoice created and sent successfully'
            : 'Invoice created successfully',
          color: 'success',
        });
      }

      handleClose();

      if (onSuccess) {
        await onSuccess();
      }
    } catch (error) {
    } finally {
      setIsSubmitting(false);
    }
  };

  const invoice =
    isEditMode && invoiceId
      ? allInvoices.find(inv => inv.id === invoiceId)
      : null;
  const isConverted = invoice?.status === 'CONVERTED';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      placement="right"
      backdrop="blur"
      className="bg-background"
    >
      <DrawerContent>
        <DrawerHeader>
          <div>
            <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">
              {isEditMode ? 'Edit Invoice' : 'Create New Invoice'}
            </h3>
            <p className="text-xs text-default-500">
              {isEditMode
                ? 'Update invoice details'
                : 'Generate a professional invoice for your customer'}
            </p>
          </div>
        </DrawerHeader>
        <DrawerBody>
          {loadingCustomers ? (
            <div className="flex items-center justify-center py-12">
              <FormSkeleton />
            </div>
          ) : (
            <FormProvider {...methods}>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <CustomerDetails customers={customers} />
                <InvoiceHeading />
                <AddItemSection />
                <InvoiceSummary />

                <div className="flex gap-3 justify-end pt-4 border-t border-divider">
                  {!isEditMode && (
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
                  )}
                  <Button
                    type="submit"
                    color="primary"
                    radius="lg"
                    size="lg"
                    isLoading={isSubmitting}
                    isDisabled={isSavingDraft || isConverted}
                    className="px-6"
                  >
                    {isEditMode
                      ? 'Update Invoice'
                      : customerEmail && customerEmail.trim() !== ''
                        ? 'Create & Send Invoice'
                        : 'Create Invoice'}
                  </Button>
                </div>

                {isConverted && (
                  <p className="text-xs text-danger text-center">
                    Cannot edit converted invoice
                  </p>
                )}
              </form>
            </FormProvider>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
