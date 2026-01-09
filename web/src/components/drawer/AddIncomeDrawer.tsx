// @/components/Drawers/AddIncomeDrawer.tsx
'use client';

import {
  Button,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  addToast,
  Card,
  CardBody,
  Accordion,
  AccordionItem,
} from '@heroui/react';
import { TrendingUp, CheckCircle } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { useState, useEffect } from 'react';

import {
  TextInput,
  NumberInput,
  AutocompleteInput,
  DropdownInput,
} from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { api } from '@/lib/axios';
import { addIncomeSchema } from '@/lib/validations/income';
import {
  AddIncomeType,
  IncomeMainCategory,
  IncomeSubCategory,
  incomeCategories,
} from '@/types/income';
import { paymentMethods } from '@/config/constant';
import { useIncomeStore } from '@/store/income-store';

interface AddIncomeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  incomeId?: string | null;
  prefilledType?: string;
  onSuccess?: (data: any) => void;
}

export function AddIncomeDrawer({
  isOpen,
  onClose,
  incomeId,
  prefilledType,
  onSuccess,
}: AddIncomeDrawerProps) {
  const [selectedMainCategory, setSelectedMainCategory] =
    useState<IncomeMainCategory>(IncomeMainCategory.OTHER_INCOME);
  const [selectedSubCategory, setSelectedSubCategory] = useState<
    IncomeSubCategory | string
  >('');
  const [mainCategoryDescription, setMainCategoryDescription] =
    useState<string>('');
  const [subCategoryNote, setSubCategoryNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { allIncome, refreshIncome } = useIncomeStore();
  const isEditMode = !!incomeId;

  const methods = useForm<AddIncomeType>({
    resolver: zodResolver(addIncomeSchema) as Resolver<AddIncomeType>,
    defaultValues: {
      mainCategory: IncomeMainCategory.OTHER_INCOME,
      subCategory: '',
      taxablePercentage: 100,
      grossAmount: undefined,
      description: '',
      date: new Date().toISOString().slice(0, 16),
      amountPaid: 0,
      paymentMethod: undefined,
      reference: '',
    },
    mode: 'all',
  });

  const {
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
    control,
  } = methods;

  const watchMainCategory = watch('mainCategory');
  const watchSubCategory = watch('subCategory');
  const watchGrossAmount = watch('grossAmount');
  const amountPaid = watch('amountPaid') || 0;

  useEffect(() => {
    if (watchMainCategory) {
      setSelectedMainCategory(watchMainCategory as IncomeMainCategory);

      if (!isEditMode) {
        setValue('subCategory', '');
      }

      const category = incomeCategories.find(
        cat => cat.value === watchMainCategory
      );
      if (category) {
        setMainCategoryDescription(category.description);
        setValue('taxablePercentage', category.taxablePercentage);
      }
    }
  }, [watchMainCategory, setValue, isEditMode]);

  useEffect(() => {
    if (watchSubCategory) {
      setSelectedSubCategory(watchSubCategory);

      const category = incomeCategories.find(
        cat => cat.value === watchMainCategory
      );
      if (category) {
        const subcategory = category.subcategories.find(
          sub => sub.value === watchSubCategory
        );
        if (subcategory) {
          setSubCategoryNote(category.note);
        }
      }
    }
  }, [watchSubCategory, watchMainCategory]);

  // Load income data for editing
  useEffect(() => {
    if (isOpen && isEditMode && incomeId) {
      const income = allIncome.find(i => i.id === incomeId);

      if (income) {
        const validPaymentMethod =
          income.paymentMethod &&
          income.paymentMethod !== 'UNPAID' &&
          income.paymentMethod !== 'OTHER'
            ? (income.paymentMethod as any)
            : undefined;

        reset({
          mainCategory: income.incomeMainCategory as IncomeMainCategory,
          subCategory:
            income.customSubCategory || income.incomeSubCategory || '',
          taxablePercentage: income.taxablePercentage || 100,
          grossAmount: income.sourceTotalAmount || 0,
          description: income.sourceDescription || '',
          date: income.date
            ? new Date(income.date).toISOString().slice(0, 16)
            : new Date().toISOString().slice(0, 16),
          amountPaid: income.amountPaid || 0,
          paymentMethod: validPaymentMethod,
          reference: income.reference || '',
        });

        setSelectedMainCategory(
          income.incomeMainCategory as IncomeMainCategory
        );
        setSelectedSubCategory(
          income.customSubCategory || income.incomeSubCategory || ''
        );
      }
    } else if (isOpen && prefilledType) {
      const typeMapping: Record<
        string,
        {
          mainCategory: IncomeMainCategory;
          subCategory: string;
        }
      > = {
        salary: {
          mainCategory: IncomeMainCategory.EMPLOYMENT_INCOME,
          subCategory: IncomeSubCategory.SALARY,
        },
        commission: {
          mainCategory: IncomeMainCategory.BUSINESS_PROFIT,
          subCategory: IncomeSubCategory.COMMISSION,
        },
        dividend: {
          mainCategory: IncomeMainCategory.INVESTMENT_INCOME,
          subCategory: IncomeSubCategory.DIVIDENDS,
        },
        'other-income': {
          mainCategory: IncomeMainCategory.OTHER_INCOME,
          subCategory: IncomeSubCategory.CUSTOM,
        },
      };

      const prefill = typeMapping[prefilledType];
      if (prefill) {
        setValue('mainCategory', prefill.mainCategory);
        setValue('subCategory', prefill.subCategory);
        setSelectedMainCategory(prefill.mainCategory);
      }
    } else if (isOpen && !isEditMode && !prefilledType) {
      reset({
        mainCategory: IncomeMainCategory.OTHER_INCOME,
        subCategory: '',
        grossAmount: undefined,
        taxablePercentage: 100,
        description: '',
        date: new Date().toISOString().slice(0, 16),
        amountPaid: 0,
        paymentMethod: undefined,
        reference: '',
      });
      setSelectedMainCategory(IncomeMainCategory.OTHER_INCOME);
      setMainCategoryDescription('');
      setSubCategoryNote('');
    }
  }, [isOpen, incomeId, isEditMode, allIncome, prefilledType, reset, setValue]);

  const onSubmit = async (data: AddIncomeType) => {
    setIsSubmitting(true);
    try {
      if (isEditMode && incomeId) {
        const response = await api.patch(`/income/${incomeId}`, data);

        await refreshIncome();
        if (onSuccess) onSuccess(response.data);

        addToast({
          title: 'Success!',
          description: 'Income record updated successfully',
          color: 'success',
        });
      } else {
        const response = await api.post('/income', data);

        await refreshIncome();
        if (onSuccess) onSuccess(response.data);

        addToast({
          title: 'Success!',
          description: 'Income record added successfully',
          color: 'success',
        });
      }

      handleClose();
    } catch (error: any) {
      console.error('Error saving income:', error);
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to save income record',
        color: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset({
      mainCategory: IncomeMainCategory.OTHER_INCOME,
      subCategory: '',
      grossAmount: undefined,
      taxablePercentage: 100,
      description: '',
      date: new Date().toISOString().slice(0, 16),
      amountPaid: 0,
      paymentMethod: undefined,
      reference: '',
    });
    setSelectedMainCategory(IncomeMainCategory.OTHER_INCOME);
    setMainCategoryDescription('');
    setSubCategoryNote('');
    onClose();
  };

  const selectedCategory = incomeCategories.find(
    cat => cat.value === selectedMainCategory
  );
  const availableSubCategories = selectedCategory?.subcategories || [];

  const getSubCategoryLabel = (value: string) => {
    const predefinedSubcategory = availableSubCategories.find(
      sub => sub.value === value
    );
    if (predefinedSubcategory) {
      return predefinedSubcategory.label;
    }
    return value;
  };

  const balance = (watchGrossAmount || 0) - amountPaid;

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
            <DrawerHeader className="flex flex-col gap-1 font-heading tracking-tight">
              <div className="flex items-center gap-2">
                <TrendingUp className="text-primary" size={24} />
                <span>
                  {isEditMode ? 'Edit Income Record' : 'Add Income Record'}
                </span>
              </div>
              <p className="text-xs text-default-500 mt-1">
                {isEditMode
                  ? 'Update income information'
                  : 'Record income from various sources'}
              </p>
            </DrawerHeader>

            <DrawerBody>
              {/* Main Category Dropdown */}
              <div className="space-y-4">
                <DropdownInput
                  isRequired
                  control={methods.control}
                  items={incomeCategories}
                  label="Main Category"
                  name="mainCategory"
                  placeholder="Select main income category"
                  description={mainCategoryDescription}
                />

                {/* Sub Category Autocomplete */}
                <AutocompleteInput
                  isRequired
                  control={methods.control}
                  getOptionLabel={item => item.label}
                  getOptionValue={item => item.value}
                  items={availableSubCategories}
                  description={subCategoryNote}
                  label="Sub Category"
                  name="subCategory"
                  placeholder="Select or type custom sub category"
                  disallowTyping={false}
                />

                {/* Amount */}
                <NumberInput
                  isRequired
                  control={methods.control}
                  description="Enter gross income amount"
                  label="Amount"
                  name="grossAmount"
                  placeholder="0.00"
                  step={1000}
                  startContent={
                    <span className="text-default-400 text-sm">₦</span>
                  }
                />

                {/* Date */}
                <TextInput
                  isRequired
                  control={methods.control}
                  label="Date"
                  name="date"
                  type="datetime-local"
                />

                {/* Description */}
                <TextInput
                  control={methods.control}
                  label="Description (Optional)"
                  name="description"
                  placeholder="Add notes about this income"
                />

                {/* Payment Accordion */}
                <Card
                  className="w-full rounded-2xl p-0 px-1 bg-transparent border border-default-200"
                  shadow="none"
                >
                  <CardBody className="p-0">
                    <Accordion variant="light">
                      <AccordionItem
                        key="payment"
                        aria-label="Payment"
                        title="Payment"
                        subtitle="Record payment received"
                        classNames={{
                          title: 'font-semibold',
                          subtitle: 'text-xs',
                        }}
                      >
                        <div className="space-y-4 pb-4">
                          <div className="grid grid-cols-1 gap-4">
                            <NumberInput
                              control={control}
                              label="Amount Received"
                              min={0}
                              max={watchGrossAmount}
                              name="amountPaid"
                              placeholder="0.00"
                              startContent={
                                <span className="text-default-400 text-sm">
                                  ₦
                                </span>
                              }
                              step={0.01}
                              description={`Balance: ${formatCurrency(balance)}`}
                            />

                            {amountPaid > 0 && (
                              <>
                                <DropdownInput
                                  isRequired
                                  control={control}
                                  items={paymentMethods}
                                  label="Payment Method"
                                  name="paymentMethod"
                                  placeholder="Select method"
                                />

                                <TextInput
                                  control={control}
                                  label="Reference (Optional)"
                                  name="reference"
                                  placeholder="e.g., TXN123456"
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </AccordionItem>
                    </Accordion>
                  </CardBody>
                </Card>

                {/* Summary */}
                <Card
                  className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800"
                  shadow="none"
                >
                  <CardBody className="p-3">
                    <h4 className="text-base font-semibold flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Income Summary
                    </h4>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-default-600">Category:</span>
                        <span className="font-medium">
                          {incomeCategories.find(
                            c => c.value === watchMainCategory
                          )?.label || 'Not selected'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-default-600">Subcategory:</span>
                        <span className="font-medium">
                          {watchSubCategory
                            ? getSubCategoryLabel(watchSubCategory)
                            : 'Not selected'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-default-600">Taxable:</span>
                        <span className="font-medium">
                          {selectedCategory?.taxablePercentage || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-default-600">Total Amount:</span>
                        <span className="font-medium text-primary">
                          {formatCurrency(watchGrossAmount || 0)}
                        </span>
                      </div>
                      {amountPaid > 0 && (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-default-600">
                              Amount Received:
                            </span>
                            <span className="font-medium text-success">
                              {formatCurrency(amountPaid)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-default-600">Balance:</span>
                            <span className="font-medium text-warning">
                              {formatCurrency(balance)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </div>
            </DrawerBody>

            <DrawerFooter>
              <Button
                isDisabled={isSubmitting}
                variant="light"
                onPress={handleClose}
              >
                Cancel
              </Button>
              <Button
                color="primary"
                isDisabled={isSubmitting}
                isLoading={isSubmitting}
                type="submit"
              >
                {isEditMode ? 'Update Income' : 'Add Income'}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </form>
      </FormProvider>
    </Drawer>
  );
}
