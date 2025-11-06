'use client';

import React, { useState, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/modal';
import { Button } from '@heroui/button';
import { Skeleton } from '@heroui/skeleton';
import {
  addToast,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
} from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, Resolver } from 'react-hook-form';

import { CustomerDetails } from '@/components/dashboard/layout/CustomerDetails';
import { QuotationHeading } from '@/components/dashboard/quotations/quotationHeading';
import { AddMaterialSection } from '@/components/dashboard/quotations/AddMaterialSection';
import { QuotationSummary } from '@/components/dashboard/quotations/QuotationSummary';
import { AddCostSection } from '@/components/dashboard/quotations/AddCostSection';
import { useCustomerStore } from '@/store/customerStore';
import { api } from '@/lib/axios';
import { FormSkeleton } from '@/components/skeleton/FormSkeleton';
import { QuotationFormType } from '@/types/quotations';
import { quotationSchema } from '@/lib/validations/quotations';
import { useQuotationStore } from '@/store/quotationStore';

interface CreateQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  quotationId?: string | null;
}

export function CreateQuotationModal({
  isOpen,
  onClose,
  onSuccess,
  quotationId,
}: CreateQuotationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const {
    customers,
    loading: loadingCustomers,
    fetchCustomers,
    addCustomer,
  } = useCustomerStore();

  const { allQuotations, updateQuotation, addQuotation } = useQuotationStore();

  const isEditMode = !!quotationId;

  const methods = useForm<QuotationFormType>({
    resolver: zodResolver(quotationSchema) as Resolver<QuotationFormType>,
    defaultValues: {
      customer: { id: '', name: '', phone: undefined, email: '' },
      addAsNewCustomer: false,
      quotationTitle: '',
      quotationDescription: '',
      materials: [],
      materialsTotal: 0,
      workmanship: 0,
      otherCosts: [],
      otherCostsTotal: 0,
      includeVAT: false,
      vatAmount: 0,
      totalAmount: 0,
      balance: 0,
      issueDate: new Date(),
      status: 'DRAFT',
    },
    mode: 'all',
  });

  const { handleSubmit, watch, reset } = methods;
  const customerEmail = watch('customer.email');

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();

      if (isEditMode && quotationId) {
        const quotation = allQuotations.find(quo => quo.id === quotationId);

        if (quotation) {
          reset({
            customer: quotation.customerId
              ? {
                  id: quotation.customerId,
                  name: quotation.customer?.name || '',
                  phone: quotation.customer?.phone || '',
                  email: quotation.customer?.email || '',
                }
              : {
                  id: '',
                  name: quotation.customerName || '',
                  phone: quotation.customerPhone || '',
                  email: quotation.customerEmail || '',
                },
            addAsNewCustomer: false,
            quotationTitle: quotation.title || '',
            quotationDescription: quotation.description || '',
            materials: quotation.materials || [],
            materialsTotal: quotation.materialsTotal || 0,
            workmanship: quotation.workmanship || 0,
            otherCosts: quotation.otherCosts || [],
            otherCostsTotal: quotation.otherCostsTotal || 0,
            includeVAT: quotation.includeVAT,
            vatAmount: quotation.vatAmount || 0,
            totalAmount: quotation.totalAmount || 0,
            balance: quotation.balance || 0,
            issueDate: quotation.issueDate
              ? new Date(quotation.issueDate)
              : undefined,
            validUntil: quotation.validUntil
              ? new Date(quotation.validUntil)
              : undefined,
            status: quotation.status,
          });
        }
      } else {
        reset({
          customer: { id: '', name: '', phone: '', email: '' },
          addAsNewCustomer: false,
          quotationTitle: '',
          quotationDescription: '',
          materials: [],
          materialsTotal: 0,
          workmanship: 0,
          otherCosts: [],
          otherCostsTotal: 0,
          includeVAT: false,
          vatAmount: 0,
          totalAmount: 0,
          balance: 0,
          issueDate: new Date(),
          status: 'DRAFT',
        });
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const formData = methods.getValues();
      const draftData = {
        ...formData,
        status: 'DRAFT' as const,

        issueDate:
          formData.issueDate instanceof Date
            ? formData.issueDate
            : new Date(formData.issueDate),
      };

      const response = await api.post('/quotations', draftData);

      if (response.data.quotation) {
        addQuotation(response.data.quotation);
      }

      if (draftData.addAsNewCustomer && response.data.customer) {
        addCustomer(response.data.customer);
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
    } catch (error: any) {
    } finally {
      setIsSavingDraft(false);
    }
  };

  const onSubmit = async (data: QuotationFormType) => {
    setIsSubmitting(true);
    try {
      if (isEditMode && quotationId) {
        const response = await api.patch(`/quotations/${quotationId}`, data);

        updateQuotation(quotationId, response.data.quotation);

        addToast({
          title: 'Success!',
          description: 'Quotation updated successfully',
          color: 'success',
        });

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }
      } else {
        const hasEmail =
          data.customer?.email && data.customer.email.trim() !== '';

        const quotationData = {
          ...data,
          status: hasEmail ? ('SENT' as const) : ('DRAFT' as const),
          issueDate:
            data.issueDate instanceof Date
              ? data.issueDate
              : new Date(data.issueDate),
        };

        const response = await api.post('/quotations', quotationData);

        if (response.data.quotation) {
          addQuotation(response.data.quotation);
        }

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }

        addToast({
          title: 'Success!',
          description: hasEmail
            ? 'Quotation created and sent successfully'
            : 'Quotation created successfully',
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
              Create New Quotation
            </h3>
            <p className="text-xs text-default-500">
              Generate a professional quotation for your customer
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
                <QuotationHeading />
                <AddMaterialSection />
                <AddCostSection />
                <QuotationSummary />

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
                    isDisabled={isSavingDraft}
                    className="px-6"
                  >
                    {isEditMode
                      ? 'Update Invoice'
                      : customerEmail && customerEmail.trim() !== ''
                        ? 'Create & Send Quotation'
                        : 'Create Quotation'}
                  </Button>
                </div>
              </form>
            </FormProvider>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
