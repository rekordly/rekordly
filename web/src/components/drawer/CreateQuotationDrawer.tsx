'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import {
  addToast,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
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
import { useIncomeStore } from '@/store/income-store';

interface CreateQuotationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  quotationId?: string | null;
}

export function CreateQuotationDrawer({
  isOpen,
  onClose,
  onSuccess,
  quotationId,
}: CreateQuotationDrawerProps) {
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

  const { allQuotations, updateQuotation, addQuotation } = useQuotationStore();
  const { refreshIncome } = useIncomeStore();

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
    mode: 'onChange',
  });

  const { handleSubmit, watch, reset, trigger, formState } = methods;
  const customerEmail = watch('customer.email');
  const materials = watch('materials');

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      setCurrentStep(1);

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
  }, [isOpen, quotationId, isEditMode, allQuotations, fetchCustomers, reset]);

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

    if (errors.quotationTitle) {
      return errors.quotationTitle.message;
    }

    if (errors.issueDate) {
      return errors.issueDate.message;
    }

    if (errors.materials) {
      const materialsError = errors.materials as any;
      if (materialsError.message) return materialsError.message;
      if (Array.isArray(materialsError)) {
        const firstMaterialError = materialsError[0];
        if (firstMaterialError) {
          const firstFieldError = Object.values(firstMaterialError)[0] as any;
          return firstFieldError?.message;
        }
      }
    }

    if (errors.otherCosts) {
      const costsError = errors.otherCosts as any;
      if (Array.isArray(costsError)) {
        const firstCostError = costsError[0];
        if (firstCostError) {
          const firstFieldError = Object.values(firstCostError)[0] as any;
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
    let fieldsToValidate: (keyof QuotationFormType)[] = [];
    let isValid = true;

    switch (step) {
      case 1:
        // Step 1: Materials validation
        fieldsToValidate = ['materials', 'materialsTotal'];

        // Check if materials array is not empty
        if (!materials || materials.length === 0) {
          addToast({
            title: 'Validation Error',
            description: 'Please add at least one material before proceeding',
            color: 'danger',
          });
          return false;
        }

        // Validate material fields
        isValid = await trigger(fieldsToValidate);
        break;

      case 2:
        // Step 2: Customer and Quotation Details validation
        fieldsToValidate = ['customer', 'quotationTitle', 'issueDate'];
        isValid = await trigger(fieldsToValidate);
        break;

      case 3:
        // Step 3: Additional Costs and Summary validation
        fieldsToValidate = ['otherCosts', 'totalAmount', 'workmanship'];
        isValid = await trigger(fieldsToValidate);
        break;
    }

    if (!isValid) {
      const errorMessage = getFirstError();
      addToast({
        title: 'Validation Error',
        description: errorMessage,
        color: 'danger',
      });
    }

    return isValid;
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
      addToast({
        title: 'Error',
        description: 'Failed to save draft',
        color: 'danger',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const onSubmit = async (data: QuotationFormType) => {
    if (stepRef.current !== TOTAL_STEPS) return;

    // Final validation before submission
    const isValid = await validateStep(3);
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      if (isEditMode && quotationId) {
        const response = await api.patch(`/quotations/${quotationId}`, data);

        updateQuotation(quotationId, response.data.quotation);
        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }
        await refreshIncome();

        addToast({
          title: 'Success!',
          description: 'Quotation updated successfully',
          color: 'success',
        });
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

        await refreshIncome();
        if (onSuccess) onSuccess();

        addToast({
          title: 'Success!',
          description: hasEmail
            ? 'Quotation created and sent successfully'
            : 'Quotation created successfully',
          color: 'success',
        });
      }
      handleClose();
    } catch (error: any) {
      console.error('Error creating/updating quotation:', error);
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to save quotation',
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
            <AddMaterialSection />
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <CustomerDetails customers={customersByRole.BUYER} />
            <QuotationHeading />
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <AddCostSection />
            <QuotationSummary />
          </div>
        );
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return 'Materials';
      case 2:
        return 'Customer & Quotation Details';
      case 3:
        return 'Additional Costs & Summary';
      default:
        return '';
    }
  };

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
                {isEditMode ? 'Edit Quotation' : 'Create New Quotation'}
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
                          : 'Create '}
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
                        ? 'Update Quotation'
                        : customerEmail && customerEmail.trim() !== ''
                          ? 'Create & Send'
                          : 'Create '}
                  </Button>
                )}
              </div>
            </DrawerFooter>
          </DrawerContent>
        </form>
      </FormProvider>
    </Drawer>
  );
}
