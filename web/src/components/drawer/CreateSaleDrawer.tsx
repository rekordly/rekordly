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
// import { useIncomeStore } from '@/store/income-store';
import { CartItem } from '@/app/dashboard/storefront/page';

interface CreateSaleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  saleId?: string | null;
  isStorefront?: boolean;
  initialItems?: CartItem[];
}

export function CreateSaleDrawer({
  isOpen,
  onClose,
  onSuccess,
  saleId,
  isStorefront = false,
  initialItems = [],
}: CreateSaleDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If storefront, skip step 1 (items) and start from step 2
  const TOTAL_STEPS = isStorefront ? 2 : 3;
  const [currentStep, setCurrentStep] = useState(isStorefront ? 2 : 1);
  const stepRef = React.useRef(isStorefront ? 2 : 1);

  const goNext = async () => {
    const isValid = await validateStep(stepRef.current);
    if (!isValid) return;

    const maxStep = isStorefront ? 3 : TOTAL_STEPS;
    if (stepRef.current < maxStep) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const goBack = () => {
    const minStep = isStorefront ? 2 : 1;
    if (stepRef.current > minStep) {
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

  const { allSales, updateSale, addSale } = useSaleStore();
  // const { refreshIncome } = useIncomeStore();

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

  const { handleSubmit, watch, reset, trigger, formState, setValue } = methods;

  // Set initial items from storefront cart
  useEffect(() => {
    if (isOpen && isStorefront && initialItems.length > 0) {
      const subtotal = initialItems.reduce((sum, item) => sum + item.amount, 0);
      setValue('items', initialItems as any);
      setValue('subtotal', subtotal);
      setValue('totalAmount', subtotal);
      setValue('balance', subtotal);
    }
  }, [isOpen, isStorefront, initialItems, setValue]);

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      setCurrentStep(isStorefront ? 2 : 1);

      if (isEditMode && saleId) {
        const sale = allSales.find(s => s.id === saleId);

        if (sale) {
          // Transform saleItems to match form structure
          const formItems = (sale.saleItems || []).map(item => ({
            id: item.id,
            itemName: item.itemName || '',
            description: item.description || '',
            quantity: item.quantity || 0,
            unitPrice: item.unitPrice || 0,
            amount: item.amount || 0,
            inventoryItemId: item.inventoryItemId || undefined,
            productionId: item.productionId || undefined,
            costPrice: item.costPrice || 0,
            profit: item.profit || 0,
          }));

          reset({
            sourceType: sale.sourceType || 'DIRECT',
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
            items: formItems,
            subtotal: sale.subtotal || 0,
            includeVAT: sale.includeVAT || false,
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
            status: sale.status || 'UNPAID',
          });
        }
      } else if (!isStorefront) {
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
  }, [
    isOpen,
    saleId,
    isEditMode,
    allSales,
    fetchCustomers,
    reset,
    isStorefront,
  ]);

  const handleClose = () => {
    onClose();
    setCurrentStep(isStorefront ? 2 : 1);
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
    let fieldsToValidate: (keyof SaleFormType)[] = [];

    if (isStorefront) {
      switch (step) {
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
    } else {
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
    const finalStep = isStorefront ? 3 : TOTAL_STEPS;
    if (stepRef.current !== finalStep) return;

    setIsSubmitting(true);
    try {
      const status =
        data.amountPaid >= data.totalAmount
          ? 'PAID'
          : data.amountPaid > 0
            ? 'PARTIALLY_PAID'
            : 'UNPAID';

      // Clean up data before sending to backend
      const saleData = {
        ...data,
        status,
        saleDate:
          data.saleDate instanceof Date
            ? data.saleDate.toISOString()
            : new Date(data.saleDate).toISOString(),
        // Clean up nullable fields
        description: data.description || null,
        invoiceId: data.invoiceId || null,
        discountType: data.discountType || null,
        discountValue: data.discountValue || null,
        // Clean up items - ensure null for empty inventoryItemId and productionId
        items: data.items.map(item => ({
          ...item,
          description: item.description || '',
          inventoryItemId: item.inventoryItemId || null,
          productionId: item.productionId || null,
        })),
      };

      if (isEditMode && saleId) {
        const response = await api.patch(`/sales/${saleId}`, saleData);
        updateSale(saleId, response.data.sale);

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }
        // await refreshIncome();
        addToast({
          title: 'Success!',
          description: 'Sale updated successfully',
          color: 'success',
        });
      } else {
        const response = await api.post('/sales', saleData);

        if (response.data.sale) {
          addSale(response.data.sale);
        }

        if (data.addAsNewCustomer && response.data.customer) {
          addCustomer(response.data.customer);
        }

        // await refreshIncome();
        if (onSuccess) onSuccess();

        addToast({
          title: 'Success!',
          description: isStorefront
            ? 'Sale completed successfully'
            : 'Sale created successfully',
          color: 'success',
        });
      }

      handleClose();
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
    if (isStorefront) {
      switch (currentStep) {
        case 2:
          return (
            <div className="space-y-4">
              <CustomerDetails customers={customersByRole.BUYER} />
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
    } else {
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
              <CustomerDetails customers={customersByRole.BUYER} />
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
    }
  };

  const getStepTitle = () => {
    if (isStorefront) {
      switch (currentStep) {
        case 2:
          return 'Customer & Sale Details';
        case 3:
          return 'Additional Charges & Payment';
        default:
          return '';
      }
    } else {
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
    }
  };

  const getStepNumber = () => {
    if (isStorefront) {
      return currentStep - 1; // Display as 1/2, 2/2
    }
    return currentStep; // Display as 1/3, 2/3, 3/3
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
                {isStorefront
                  ? 'Complete Checkout'
                  : isEditMode
                    ? 'Edit Sale'
                    : 'Create New Sale'}
              </h3>
              <div className="flex items-center justify-between w-full mt-2">
                <p className="text-xs text-default-500">
                  Step {getStepNumber()} of {TOTAL_STEPS}: {getStepTitle()}
                </p>
                <div className="flex gap-1">
                  {isStorefront ? (
                    <>
                      {[2, 3].map(step => (
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
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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
                {currentStep > (isStorefront ? 2 : 1) && (
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
                  <div>
                    {currentStep < (isStorefront ? 3 : TOTAL_STEPS) && (
                      <Button
                        type="button"
                        onClick={goNext}
                        className="px-6"
                        color="primary"
                        disabled={loadingCustomers}
                      >
                        Next
                      </Button>
                    )}

                    {currentStep === (isStorefront ? 3 : TOTAL_STEPS) && (
                      <Button
                        type="submit"
                        className="px-6"
                        color="primary"
                        isLoading={isSubmitting}
                      >
                        {isSubmitting ? 'Processing...' : 'Complete Sale'}
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
