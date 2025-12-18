'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import {
  addToast,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
} from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, Resolver, useForm } from 'react-hook-form';

import { useCustomerStore } from '@/store/customerStore';
import { api } from '@/lib/axios';
import { FormSkeleton } from '@/components/skeleton/FormSkeleton';
import { CreatePurchaseSchema } from '@/lib/validations/purchases';
import { usePurchaseStore } from '@/store/purchase-store';
import { PurchaseFormType } from '@/types/purchases';

// Import components (we'll create these next)
import { CustomerDetails } from '@/components/dashboard/layout/CustomerDetails';
import { PurchaseHeading } from '../dashboard/purchase/PurchaseHeading';
import { AddPurchaseItemSection } from '../dashboard/purchase/AddPurchaseItemSection';
import { PurchaseCostsAndPaymentSection } from '../dashboard/purchase/PurchaseCostsAndPaymentSection';
import { PurchaseSummary } from '../dashboard/purchase/PurchaseSummary';
import { useExpenseStore } from '@/store/expense-store';

interface CreatePurchaseDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  purchaseId?: string | null;
}

export function CreatePurchaseDrawer({
  isOpen,
  onClose,
  onSuccess,
  purchaseId,
}: CreatePurchaseDrawerProps) {
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

  const { allPurchases, updatePurchase, addPurchase } = usePurchaseStore();
  const { refreshExpense } = useExpenseStore();

  const isEditMode = !!purchaseId;

  const methods = useForm<PurchaseFormType>({
    resolver: zodResolver(CreatePurchaseSchema) as Resolver<PurchaseFormType>,
    defaultValues: {
      customer: {
        id: '',
        name: '',
        email: '',
        phone: '',
        customerRole: 'SUPPLIER',
      },
      addAsNewCustomer: false,
      title: '',
      description: '',
      purchaseDate: new Date(),
      items: [],
      subtotal: 0,
      otherCosts: [],
      otherCostsTotal: 0,
      includeVAT: false,
      vatAmount: 0,
      totalAmount: 0,
      amountPaid: 0,
      balance: 0,
      status: 'UNPAID',
      paymentMethod: 'BANK_TRANSFER',
    },
    mode: 'onChange',
  });

  const { handleSubmit, watch, reset, trigger, formState } = methods;

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      setCurrentStep(1);

      if (isEditMode && purchaseId) {
        const purchase = allPurchases.find(p => p.id === purchaseId);
        console.log('Editing purchase:', purchase);
        if (purchase) {
          reset({
            customer: {
              id: purchase.customerId || '',
              name: purchase.vendorName || '',
              email: purchase.vendorEmail || '',
              phone: purchase.vendorPhone || '',
            },
            addAsNewCustomer: false,
            title: purchase.title || '',
            description: purchase.description || '',
            purchaseDate: purchase.purchaseDate
              ? new Date(purchase.purchaseDate)
              : new Date(),
            items: purchase.items || [],
            subtotal: purchase.subtotal || 0,
            otherCosts: purchase.otherCosts || [],
            otherCostsTotal: purchase.otherCostsTotal || 0,
            includeVAT: purchase.includeVAT,
            vatAmount: purchase.vatAmount || 0,
            totalAmount: purchase.totalAmount || 0,
            amountPaid: purchase.amountPaid || 0,
            balance: purchase.balance || 0,
            status: purchase.status,
            paymentMethod: 'BANK_TRANSFER',
          });
        }
      } else {
        reset({
          customer: {
            id: '',
            name: '',
            email: '',
            phone: '',
            customerRole: 'SUPPLIER',
          },
          addAsNewCustomer: false,
          title: '',
          description: '',
          purchaseDate: new Date(),
          items: [],
          subtotal: 0,
          otherCosts: [],
          otherCostsTotal: 0,
          includeVAT: false,
          vatAmount: 0,
          totalAmount: 0,
          amountPaid: 0,
          balance: 0,
          status: 'UNPAID',
          paymentMethod: 'BANK_TRANSFER',
        });
      }
    }
  }, [isOpen, purchaseId, isEditMode, allPurchases, fetchCustomers, reset]);

  const handleClose = () => {
    onClose();
    setCurrentStep(1);
  };

  const getFirstError = () => {
    const errors = formState.errors;

    // Check for customer errors
    if (errors.customer) {
      const customerError = errors.customer as any;
      if (customerError.name) return customerError.name.message;
      if (customerError.email) return customerError.email.message;
      if (customerError.phone) return customerError.phone.message;
    }

    if (errors.title) {
      return errors.title.message;
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

    // Check other fields
    const errorFields = Object.keys(errors) as (keyof typeof errors)[];
    if (errorFields.length > 0) {
      const firstField = errorFields[0];
      const error = errors[firstField] as any;
      return error?.message || 'Please fix errors before proceeding';
    }

    return 'Please fix errors before proceeding';
  };

  const validateStep = async (step: number): Promise<boolean> => {
    let fieldsToValidate: (keyof PurchaseFormType)[] = [];

    switch (step) {
      case 1:
        fieldsToValidate = ['customer', 'title', 'purchaseDate'];
        break;
      case 2:
        fieldsToValidate = ['items', 'subtotal'];
        break;
      case 3:
        fieldsToValidate = [
          'totalAmount',
          'balance',
          'amountPaid',
          'otherCostsTotal',
        ];
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

  const onSubmit = async (data: PurchaseFormType) => {
    if (stepRef.current !== TOTAL_STEPS) return;
    setIsSubmitting(true);
    try {
      // Determine status based on payment
      const status =
        data.amountPaid >= data.totalAmount
          ? 'PAID'
          : data.amountPaid > 0
            ? 'PARTIALLY_PAID'
            : 'UNPAID';

      const purchaseData = {
        ...data,
        status,
        purchaseDate:
          data.purchaseDate instanceof Date
            ? data.purchaseDate.toISOString()
            : new Date(data.purchaseDate).toISOString(),
        createExpense: true,
      };

      if (isEditMode && purchaseId) {
        const response = await api.patch(
          `/purchases/${purchaseId}`,
          purchaseData
        );

        updatePurchase(purchaseId, response.data.purchase);

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }

        await refreshExpense();

        addToast({
          title: 'Success!',
          description: 'Purchase updated successfully',
          color: 'success',
        });
      } else {
        const response = await api.post('/purchases', purchaseData);

        if (response.data.purchase) {
          addPurchase(response.data.purchase);
        }

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }

        await refreshExpense();

        addToast({
          title: 'Success!',
          description: 'Purchase created successfully',
          color: 'success',
        });
      }

      handleClose();

      if (onSuccess) {
        await onSuccess();
      }
    } catch (error: any) {
      console.error('Error creating/updating purchase:', error);
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to save purchase',
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
            <CustomerDetails
              customers={customersByRole.SUPPLIER}
              role="SUPPLIER"
              title="Supplier Details"
              optional={false}
            />
            <PurchaseHeading />
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <AddPurchaseItemSection />
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <PurchaseCostsAndPaymentSection />
            <PurchaseSummary />
          </div>
        );
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return 'Supplier & Purchase Details';
      case 2:
        return 'Purchase Items';
      case 3:
        return 'Costs & Payment';
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
                {isEditMode ? 'Edit Purchase' : 'Create New Purchase'}
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
                        {isSubmitting ? 'Submitting...' : 'Submit'}
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
