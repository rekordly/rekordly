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
import { CreateQuotationInput, QuotationFormInput } from '@/types/quotations';
import { CreateQuotationSchema } from '@/lib/validations/quotations';
import { useQuotationStore } from '@/store/quotationStore';
// import { useIncomeStore } from '@/store/income-store';
import { PaymentMethod } from '@/types/index';

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
  // const { refreshIncome } = useIncomeStore();

  const isEditMode = !!quotationId;

  // Use the correct form input type
  const methods = useForm<CreateQuotationInput>({
    resolver: zodResolver(
      CreateQuotationSchema
    ) as Resolver<CreateQuotationInput>,
    defaultValues: {
      customer: {
        id: '',
        name: '',
        phone: '',
        email: '',
        customerRole: 'BUYER' as const,
      },
      addAsNewCustomer: false,
      title: '',
      description: '',
      lineItems: [],
      subtotal: 0,
      discountType: undefined,
      discountValue: 0,
      discountAmount: 0,
      otherCosts: [],
      includeVAT: false,
      vatAmount: 0,
      totalAmount: 0,
      amountPaid: 0,
      balance: 0,
      issueDate: new Date(),
      validUntil: undefined,
      status: 'DRAFT',
      paymentMethod: 'BANK_TRANSFER' as const,
      reference: '',
      notes: '',
    },
    mode: 'onChange',
  });

  const { handleSubmit, watch, reset, trigger, formState } = methods;
  const customerEmail = watch('customer.email');
  const lineItems = watch('lineItems');

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      setCurrentStep(1);

      if (isEditMode && quotationId) {
        const quotation = allQuotations.find(quo => quo.id === quotationId);

        if (quotation) {
          // Prepare form data from quotation
          const formData: CreateQuotationInput = {
            customer: {
              id: quotation.customerId || '',
              name: quotation.customer?.name || quotation.customerName || '',
              phone: quotation.customer?.phone || quotation.customerPhone || '',
              email: quotation.customer?.email || quotation.customerEmail || '',
              customerRole: 'BUYER' as const,
            },
            addAsNewCustomer: false,
            title: quotation.title || '',
            description: quotation.description || '',
            lineItems: quotation.lineItems || [],
            subtotal: quotation.subtotal || 0,
            discountType: quotation.discountType || undefined,
            discountValue: quotation.discountValue || 0,
            discountAmount: quotation.discountAmount || 0,
            otherCosts: quotation.otherCosts || [],
            includeVAT: quotation.includeVAT || false,
            vatAmount: quotation.vatAmount || 0,
            totalAmount: quotation.totalAmount || 0,
            amountPaid: quotation.amountPaid || 0,
            balance: quotation.balance || 0,
            issueDate: quotation.issueDate
              ? new Date(quotation.issueDate)
              : new Date(),
            validUntil: quotation.validUntil
              ? new Date(quotation.validUntil)
              : undefined,
            status: quotation.status || 'DRAFT',
            paymentMethod: (quotation.payments?.[0]?.paymentMethod ||
              'BANK_TRANSFER') as PaymentMethod,
            reference: quotation.payments?.[0]?.reference || '',
            notes: quotation.payments?.[0]?.notes || '',
          };

          reset(formData);
        }
      } else {
        reset({
          customer: {
            id: '',
            name: '',
            phone: '',
            email: '',
            customerRole: 'BUYER' as const,
          },
          addAsNewCustomer: false,
          title: '',
          description: '',
          lineItems: [],
          subtotal: 0,
          discountType: undefined,
          discountValue: 0,
          discountAmount: 0,
          otherCosts: [],
          includeVAT: false,
          vatAmount: 0,
          totalAmount: 0,
          amountPaid: 0,
          balance: 0,
          issueDate: new Date(),
          validUntil: undefined,
          status: 'DRAFT',
          paymentMethod: 'BANK_TRANSFER' as const,
          reference: '',
          notes: '',
        });
      }
    }
  }, [isOpen, quotationId, isEditMode, allQuotations, fetchCustomers, reset]);

  const totalAmount = watch('totalAmount');
  const amountPaid = watch('amountPaid');

  useEffect(() => {
    // Auto-calculate balance whenever totalAmount or amountPaid changes
    const calculatedBalance = totalAmount - amountPaid;
    const currentBalance = watch('balance');

    // Only update if different to avoid infinite loops
    if (Math.abs(calculatedBalance - currentBalance) > 0.01) {
      methods.setValue('balance', calculatedBalance, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [totalAmount, amountPaid, methods, watch]);

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

    if (errors.title) {
      return errors.title.message;
    }

    if (errors.issueDate) {
      return errors.issueDate.message;
    }

    if (errors.lineItems) {
      const lineItemsError = errors.lineItems as any;
      if (lineItemsError.message) return lineItemsError.message;
      if (Array.isArray(lineItemsError)) {
        const firstItemError = lineItemsError[0];
        if (firstItemError) {
          const firstFieldError = Object.values(firstItemError)[0] as any;
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
    let fieldsToValidate: (keyof CreateQuotationInput)[] = [];
    let isValid = true;

    switch (step) {
      case 1:
        // Step 1: Line Items validation
        fieldsToValidate = ['lineItems', 'subtotal'];

        // Check if lineItems array is not empty
        if (!lineItems || lineItems.length === 0) {
          addToast({
            title: 'Validation Error',
            description: 'Please add at least one line item before proceeding',
            color: 'danger',
          });
          return false;
        }

        // Validate line item fields
        isValid = await trigger(fieldsToValidate);
        break;

      case 2:
        // Step 2: Customer and Quotation Details validation
        fieldsToValidate = ['customer', 'title', 'issueDate'];
        isValid = await trigger(fieldsToValidate);
        break;

      case 3:
        // Step 3: Additional Costs and Summary validation
        fieldsToValidate = [
          'otherCosts',
          'totalAmount',
          'discountAmount',
          'balance',
        ];
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

  const onSubmit = async (data: CreateQuotationInput) => {
    if (stepRef.current !== TOTAL_STEPS) {
      return;
    }

    // Final validation before submission

    const isValid = await validateStep(3);
    if (!isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Determine status based on whether email is provided
      const hasEmail =
        data.customer?.email && data.customer.email.trim() !== '';
      const finalStatus = hasEmail ? 'SENT' : 'DRAFT';

      const submissionData: CreateQuotationInput = {
        ...data,
        status: finalStatus,
        issueDate:
          data.issueDate instanceof Date
            ? data.issueDate
            : new Date(data.issueDate),
        validUntil: data.validUntil
          ? data.validUntil instanceof Date
            ? data.validUntil
            : new Date(data.validUntil)
          : undefined,
      };

      if (isEditMode && quotationId) {
        const response = await api.patch(
          `/quotations/${quotationId}`,
          submissionData
        );

        updateQuotation(quotationId, response.data.quotation);
        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }

        addToast({
          title: 'Success!',
          description: 'Quotation updated successfully',
          color: 'success',
        });
      } else {
        const response = await api.post('/quotations', submissionData);

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

        if (onSuccess) {
          await onSuccess();
        }
      }

      handleClose();
    } catch (error: any) {
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
            <CustomerDetails customers={customersByRole.BUYER} role="BUYER" />
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
        return 'Line Items';
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
              <div className="flex gap-3 justify-between w-full">
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

                <div className="flex gap-3 flex-1 justify-end">
                  <Button
                    className="px-6"
                    color="default"
                    isDisabled={isSubmitting}
                    type="button"
                    variant="light"
                    onPress={handleClose}
                  >
                    Cancel
                  </Button>

                  <div>
                    {currentStep < TOTAL_STEPS && (
                      <Button
                        type="button"
                        onClick={goNext}
                        className="px-6"
                        color="primary"
                      >
                        Next
                      </Button>
                    )}

                    {currentStep === TOTAL_STEPS && (
                      <Button
                        type="submit"
                        className="px-6"
                        color="primary"
                        isLoading={isSubmitting}
                      >
                        {isSubmitting
                          ? 'Submitting...'
                          : isEditMode
                            ? 'Update Quotation'
                            : customerEmail?.trim()
                              ? 'Create & Send'
                              : 'Create Quotation'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </form>
      </FormProvider>
    </Drawer>
  );
}
