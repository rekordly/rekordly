'use client';

import React, { useState, useEffect } from 'react';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
} from '@heroui/react';
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

interface CreateInvoiceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  invoiceId?: string | null;
}

export function CreateInvoiceDrawer({
  isOpen,
  onClose,
  onSuccess,
  invoiceId,
}: CreateInvoiceDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const TOTAL_STEPS = 3;
  const [currentStep, setCurrentStep] = useState(1);
  const stepRef = React.useRef(1);

  const goNext = async () => {
    const isValid = await validateStep(stepRef.current);
    if (!isValid) return;

    if (stepRef.current < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const goBack = () => {
    if (stepRef.current > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  useEffect(() => {
    stepRef.current = currentStep;
  }, [currentStep]);

  const {
    customersByRole,
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
    mode: 'onChange',
  });

  const { handleSubmit, watch, reset, trigger, formState } = methods;
  const customerEmail = watch('customer.email');

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      setCurrentStep(1);

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
  }, [isOpen, invoiceId, isEditMode, allInvoices, fetchCustomers, reset]);

  const handleClose = () => {
    onClose();
    setCurrentStep(1);
  };

  const getFirstError = () => {
    const errors = formState.errors;

    if (errors.customer) {
      const customerErrors = errors.customer as any;
      if (customerErrors.name) return customerErrors.name.message;
      if (customerErrors.phone) return customerErrors.phone.message;
      if (customerErrors.email) return customerErrors.email.message;
    }

    if (errors.items) {
      const itemsError = errors.items as any;
      if (itemsError.message) return itemsError.message;
      if (Array.isArray(itemsError)) {
        const firstItemError = itemsError[0];
        if (firstItemError) {
          const firstFieldError = Object.values(firstItemError)[0] as any;
          return firstFieldError?.message;
        }
      }
    }

    const errorFields = Object.keys(errors) as (keyof typeof errors)[];
    if (errorFields.length > 0) {
      const firstField = errorFields[0];
      const error = errors[firstField] as any;
      return error?.message || 'Please fix the errors before proceeding';
    }

    return 'Please fix the errors before proceeding';
  };

  const validateStep = async (step: number): Promise<boolean> => {
    let fieldsToValidate: (keyof InvoiceFormType)[] = [];

    switch (step) {
      case 1:
        fieldsToValidate = ['items', 'amount'];
        break;
      case 2:
        fieldsToValidate = ['customer', 'invoiceTitle'];
        break;
      case 3:
        fieldsToValidate = ['totalAmount'];
        break;
    }

    const result = await trigger(fieldsToValidate);

    if (!result) {
      const errorMessage = getFirstError();
      addToast({
        title: 'Validation Error',
        description: errorMessage,
        color: 'danger',
      });
    }

    return result;
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const formData = methods.getValues();
      const draftData = { ...formData, status: 'DRAFT' as const };

      const response = await api.post('/invoices', draftData);

      if (response.data.invoice) {
        addInvoice(response.data.invoice);
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
    } catch (error) {
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
    if (stepRef.current !== TOTAL_STEPS) return;
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
    } catch (error: any) {
      console.error('Error creating/updating invoice:', error);
      addToast({
        title: 'Error',
        description: error?.response?.data?.message || 'Failed to save invoice',
        color: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <AddItemSection />
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <CustomerDetails customers={customersByRole.BUYER} />
            <InvoiceHeading />
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <InvoiceSummary />
          </div>
        );
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return 'Invoice Items';
      case 2:
        return 'Customer & Invoice Details';
      case 3:
        return 'Summary & Finalize';
      default:
        return '';
    }
  };

  const invoice =
    isEditMode && invoiceId
      ? allInvoices.find(inv => inv.id === invoiceId)
      : null;
  const isConverted = invoice?.status === 'CONVERTED';

  return (
    <Drawer
      backdrop="blur"
      className="bg-background"
      isOpen={isOpen}
      placement="right"
      size="lg"
      onClose={handleClose}
    >
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DrawerContent>
            <DrawerHeader className="flex-col items-start">
              <h3 className="text-lg font-semibold text-foreground">
                {isEditMode ? 'Edit Invoice' : 'Create New Invoice'}
              </h3>
              <div className="flex items-center justify-between w-full mt-2">
                <p className="text-xs text-default-500">
                  Step {currentStep} of 3: {getStepTitle()}
                </p>
                <div className="flex gap-1">
                  {[1, 2, 3].map(step => (
                    <div
                      key={step}
                      className={`w-2 h-2 rounded-full ${
                        step === currentStep
                          ? 'bg-primary'
                          : step < currentStep
                            ? 'bg-success'
                            : 'bg-default-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </DrawerHeader>
            <DrawerBody>
              {loadingCustomers ? (
                <div className="flex items-center justify-center py-12">
                  <FormSkeleton />
                </div>
              ) : (
                renderStepContent()
              )}
            </DrawerBody>
            <DrawerFooter>
              <div
                className={`grid gap-2 w-full ${
                  currentStep === 3
                    ? 'grid-cols-[auto_1fr_1fr]'
                    : currentStep > 1
                      ? 'grid-cols-[auto_1fr_auto_auto]'
                      : 'grid-cols-[1fr_auto_auto]'
                }`}
              >
                {/* Back button - first column */}
                {currentStep > 1 && (
                  <Button
                    type="button"
                    onClick={goBack}
                    variant="bordered"
                    className="px-6"
                    color="default"
                  >
                    Back
                  </Button>
                )}

                {/* Step 3 - Save as Draft */}
                {currentStep === 3 && !isEditMode && (
                  <Button
                    color="warning"
                    isDisabled={isSubmitting}
                    isLoading={isSavingDraft}
                    type="button"
                    variant="flat"
                    onPress={handleSaveDraft}
                  >
                    Save as Draft
                  </Button>
                )}

                {/* Step 3 - Submit button */}
                {currentStep === 3 && (
                  <Button
                    type="submit"
                    color="primary"
                    isLoading={isSubmitting}
                    isDisabled={isSavingDraft}
                  >
                    {isSubmitting
                      ? 'Submitting...'
                      : isEditMode
                        ? 'Update Quotation'
                        : customerEmail && customerEmail.trim() !== ''
                          ? 'Create & Send'
                          : 'Create Inovice'}
                  </Button>
                )}

                {/* Next button - steps 1-2 */}
                {currentStep < TOTAL_STEPS && (
                  <Button type="button" onClick={goNext} color="primary">
                    Next
                  </Button>
                )}

                {/* Final submit for other steps */}
                {currentStep === TOTAL_STEPS && currentStep !== 3 && (
                  <Button
                    type="submit"
                    color="primary"
                    isLoading={isSubmitting}
                    isDisabled={isSavingDraft}
                  >
                    {isSubmitting
                      ? 'Submitting...'
                      : isEditMode
                        ? 'Update Invoice'
                        : customerEmail && customerEmail.trim() !== ''
                          ? 'Create & Send'
                          : 'Create Invoice'}
                  </Button>
                )}
              </div>
              {isConverted && (
                <p className="text-xs text-danger text-center w-full mt-2">
                  Cannot edit converted invoice
                </p>
              )}
            </DrawerFooter>
          </DrawerContent>
        </form>
      </FormProvider>
    </Drawer>
  );
}
