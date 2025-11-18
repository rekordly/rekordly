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

import { CustomerDetails } from '@/components/dashboard/layout/CustomerDetails';
import { SaleHeading } from '@/components/dashboard/sales/SaleHeading';
import { AddSaleItemSection } from '@/components/dashboard/sales/AddSaleItemSection';
import { ExpensesAndPaymentSection } from '@/components/dashboard/sales/ExpensesAndPaymentSection';
import { SaleSummary } from '@/components/dashboard/sales/SaleSummary';
import { useCustomerStore } from '@/store/customerStore';
import { api } from '@/lib/axios';
import { FormSkeleton } from '@/components/skeleton/FormSkeleton';
import { CreateSaleSchema } from '@/lib/validations/sales';
import { useSaleStore } from '@/store/saleStore';
import { SaleFormType } from '@/types/sales';

interface CreateSaleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  saleId?: string | null;
}

export function CreateSaleDrawer({
  isOpen,
  onClose,
  onSuccess,
  saleId,
}: CreateSaleDrawerProps) {
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
    customers,
    loading: loadingCustomers,
    fetchCustomers,
    addCustomer,
  } = useCustomerStore();

  const { allSales, updateSale, addSale } = useSaleStore();

  const isEditMode = !!saleId;

  const methods = useForm<SaleFormType>({
    resolver: zodResolver(CreateSaleSchema) as Resolver<SaleFormType>,
    defaultValues: {
      sourceType: 'DIRECT',
      invoiceId: '',
      customer: { id: '', name: '', phone: '', email: '' },
      addAsNewCustomer: false,
      title: '',
      description: '',
      saleDate: new Date(),
      items: [],
      subtotal: 0,
      includeVAT: false,
      vatAmount: 0,
      discountType: undefined,
      discountValue: 0,
      discountAmount: 0,
      deliveryCost: 0,
      otherSaleExpenses: [],
      totalSaleExpenses: 0,
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

      if (isEditMode && saleId) {
        const sale = allSales.find(s => s.id === saleId);

        if (sale) {
          reset({
            sourceType: sale.sourceType,
            invoiceId: sale.invoiceId || '',
            customer: sale.customerId
              ? {
                  id: sale.customerId,
                  name: sale.customer?.name || '',
                  phone: sale.customer?.phone || '',
                  email: sale.customer?.email || '',
                }
              : {
                  id: '',
                  name: sale.customerName || '',
                  phone: sale.customerPhone || '',
                  email: sale.customerEmail || '',
                },
            addAsNewCustomer: false,
            title: sale.title || '',
            description: sale.description || '',
            saleDate: sale.saleDate ? new Date(sale.saleDate) : new Date(),
            items: sale.items || [],
            subtotal: sale.subtotal || 0,
            includeVAT: sale.includeVAT,
            vatAmount: sale.vatAmount || 0,
            discountType: sale.discountType || undefined,
            discountValue: sale.discountValue || 0,
            discountAmount: sale.discountAmount || 0,
            deliveryCost: sale.deliveryCost || 0,
            otherSaleExpenses: sale.otherSaleExpenses || [],
            totalSaleExpenses: sale.totalSaleExpenses || 0,
            totalAmount: sale.totalAmount || 0,
            amountPaid: sale.amountPaid || 0,
            balance: sale.balance || 0,
            status: sale.status,
          });
        }
      } else {
        reset({
          sourceType: 'DIRECT',
          invoiceId: '',
          customer: { id: '', name: '', phone: '', email: '' },
          addAsNewCustomer: false,
          title: '',
          description: '',
          saleDate: new Date(),
          items: [],
          subtotal: 0,
          includeVAT: false,
          vatAmount: 0,
          discountType: undefined,
          discountValue: 0,
          discountAmount: 0,
          deliveryCost: 0,
          otherSaleExpenses: [],
          totalSaleExpenses: 0,
          totalAmount: 0,
          amountPaid: 0,
          balance: 0,
          status: 'UNPAID',
          paymentMethod: 'BANK_TRANSFER',
        });
      }
    }
  }, [isOpen, saleId, isEditMode, allSales, fetchCustomers, reset]);

  const handleClose = () => {
    onClose();
    setCurrentStep(1);
  };

  const getFirstError = () => {
    const errors = formState.errors;

    // Check for nested errors
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

    // Check other fields
    const errorFields = Object.keys(errors) as (keyof typeof errors)[];
    if (errorFields.length > 0) {
      const firstField = errorFields[0];
      const error = errors[firstField] as any;
      return error?.message || 'Please fix the errors before proceeding';
    }

    return 'Please fix the errors before proceeding';
  };

  const validateStep = async (step: number): Promise<boolean> => {
    let fieldsToValidate: (keyof SaleFormType)[] = [];

    switch (step) {
      case 1:
        fieldsToValidate = ['items', 'subtotal'];
        break;
      case 2:
        fieldsToValidate = ['customer', 'title', 'saleDate'];
        break;
      case 3:
        fieldsToValidate = [
          'totalAmount',
          'balance',
          'amountPaid',
          'discountAmount',
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

  const onSubmit = async (data: SaleFormType) => {
    console.log(currentStep);
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

      const saleData = {
        ...data,
        status,
        saleDate:
          data.saleDate instanceof Date
            ? data.saleDate.toISOString()
            : new Date(data.saleDate).toISOString(),
      };

      if (isEditMode && saleId) {
        const response = await api.patch(`/sales/${saleId}`, saleData);

        updateSale(saleId, response.data.sale);

        addToast({
          title: 'Success!',
          description: 'Sale updated successfully',
          color: 'success',
        });

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }
      } else {
        const response = await api.post('/sales', saleData);

        if (response.data.sale) {
          addSale(response.data.sale);
        }

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }

        addToast({
          title: 'Success!',
          description: 'Sale created successfully',
          color: 'success',
        });
      }

      handleClose();

      if (onSuccess) {
        await onSuccess();
      }
    } catch (error: any) {
      console.error('Error creating/updating sale:', error);
      addToast({
        title: 'Error',
        description: error?.response?.data?.message || 'Failed to save sale',
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
            <AddSaleItemSection />
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <CustomerDetails customers={customers} />
            <SaleHeading />
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <ExpensesAndPaymentSection />
            <SaleSummary />
          </div>
        );
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return 'Sale Items';
      case 2:
        return 'Customer & Sale Details';
      case 3:
        return 'Additional Charges & Payment';
      default:
        return '';
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 1:
        return 'Add items to this sale';
      case 2:
        return 'Enter customer information and sale details';
      case 3:
        return 'Add expenses, discounts, VAT and payment';
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
                {isEditMode ? 'Edit Sale' : 'Create New Sale'}
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
                        // disabled={isSubmitting}
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
