// @/components/Drawers/AddExpensesDrawer.tsx
'use client';

import {
  Button,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  addToast,
} from '@heroui/react';
import { TrendingDown } from 'lucide-react';
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
import { addExpenseSchema } from '@/lib/validations/expenses';
import {
  ExpenseCategory,
  expensesCategories,
  AddExpenseType,
} from '@/types/expenses';
import { paymentMethods } from '@/config/constant';
import { useExpenseStore } from '@/store/expense-store';

interface AddExpensesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  expenseId?: string | null;
  prefilledType?: string;
  onSuccess?: (data: any) => void;
}

export function AddExpensesDrawer({
  isOpen,
  onClose,
  expenseId,
  prefilledType,
  onSuccess,
}: AddExpensesDrawerProps) {
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory>(
    ExpenseCategory.OTHER
  );
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [categoryDescription, setCategoryDescription] = useState<string>('');
  const [categoryNote, setCategoryNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { allExpense } = useExpenseStore();
  const isEditMode = !!expenseId;

  const methods = useForm<AddExpenseType>({
    resolver: zodResolver(addExpenseSchema) as Resolver<AddExpenseType>,
    defaultValues: {
      category: ExpenseCategory.OTHER,
      subCategory: '',
      amount: undefined,
      isDeductible: true,
      deductionPercentage: 100,
      description: '',
      date: new Date().toISOString().slice(0, 16),
      vendorName: '',
      receipt: '',
    },
    mode: 'all',
  });

  const {
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = methods;

  const watchCategory = watch('category');
  const watchSubCategory = watch('subCategory');
  const watchAmount = watch('amount');
  const watchIsDeductible = watch('isDeductible');

  useEffect(() => {
    if (watchCategory) {
      setSelectedCategory(watchCategory as ExpenseCategory);

      // Don't clear subcategory in edit mode on initial load
      if (!isEditMode) {
        setValue('subCategory', '');
      }

      // Update category description and default deduction percentage
      const category = expensesCategories.find(
        cat => cat.value === watchCategory
      );
      if (category) {
        setCategoryDescription(category.description);
        setCategoryNote(category.note);
        setValue('deductionPercentage', category.defaultDeductionPercentage);
      }
    }
  }, [watchCategory, setValue, isEditMode]);

  useEffect(() => {
    if (watchSubCategory) {
      setSelectedSubCategory(watchSubCategory);
    }
  }, [watchSubCategory]);

  // Load expense data for editing
  useEffect(() => {
    if (isOpen && isEditMode && expenseId) {
      const expense = allExpense.find(e => e.id === expenseId);
      console.log('Editing expense:', expense);

      if (expense) {
        reset({
          category: expense.category as ExpenseCategory,
          subCategory: expense.subCategory || '',
          amount: expense.amount,
          isDeductible: expense.isDeductible,
          deductionPercentage: expense.deductionPercentage,
          description: expense.sourceDescription || '',
          date: expense.date
            ? new Date(expense.date).toISOString().slice(0, 16)
            : new Date().toISOString().slice(0, 16),
          vendorName: expense.vendorName || '',
          receipt: expense.receipt || '',
          paymentMethod: expense.paymentMethod || 'BANK_TRANSFER',
          reference: expense.reference || '',
          // note: expense.note || '',
        });

        setSelectedCategory(expense.category as ExpenseCategory);
        setSelectedSubCategory(expense.subCategory || '');
      }
    } else if (isOpen && prefilledType) {
      const typeMapping: Record<string, ExpenseCategory> = {
        'office-supplies': ExpenseCategory.OFFICE_SUPPLIES,
        rent: ExpenseCategory.RENT_RATES,
        utilities: ExpenseCategory.UTILITIES,
        meals: ExpenseCategory.ENTERTAINMENT,
        travel: ExpenseCategory.TRANSPORTATION,
        software: ExpenseCategory.SOFTWARE_SUBSCRIPTIONS,
      };

      const prefill = typeMapping[prefilledType];
      if (prefill) {
        setValue('category', prefill);
        setSelectedCategory(prefill);
      }
    } else if (isOpen && !isEditMode && !prefilledType) {
      reset({
        category: ExpenseCategory.OTHER,
        subCategory: '',
        amount: undefined,
        isDeductible: true,
        deductionPercentage: 100,
        description: '',
        date: new Date().toISOString().slice(0, 16),
        vendorName: '',
        receipt: '',
      });
      setSelectedCategory(ExpenseCategory.OTHER);
      setCategoryDescription('');
      setCategoryNote('');
    }
  }, [
    isOpen,
    expenseId,
    isEditMode,
    allExpense,
    prefilledType,
    reset,
    setValue,
  ]);

  const onSubmit = async (data: AddExpenseType) => {
    setIsSubmitting(true);
    try {
      if (isEditMode && expenseId) {
        // Update existing expense
        const response = await api.patch(`/expenses/${expenseId}`, data);

        addToast({
          title: 'Success!',
          description: 'Expense record updated successfully',
          color: 'success',
        });

        if (onSuccess) {
          await onSuccess(response.data);
        }
      } else {
        // Create new expense
        const response = await api.post('/expenses', data);

        addToast({
          title: 'Success!',
          description: 'Expense record added successfully',
          color: 'success',
        });

        if (onSuccess) {
          await onSuccess(response.data);
        }
      }

      handleClose();
    } catch (error: any) {
      console.error('Error saving expense:', error);
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to save expense record',
        color: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset({
      category: ExpenseCategory.OTHER,
      subCategory: '',
      amount: undefined,
      isDeductible: true,
      deductionPercentage: 100,
      description: '',
      date: new Date().toISOString().slice(0, 16),
      vendorName: '',
      receipt: '',
    });
    setSelectedCategory(ExpenseCategory.OTHER);
    setCategoryDescription('');
    setCategoryNote('');
    onClose();
  };

  // Get available subcategories for the selected category
  const selectedCategoryData = expensesCategories.find(
    cat => cat.value === selectedCategory
  );
  const availableSubCategories = selectedCategoryData?.subcategories || [];

  // Function to get subcategory label for display
  const getSubCategoryLabel = (value: string) => {
    const predefinedSubcategory = availableSubCategories.find(
      sub => sub.value === value
    );
    if (predefinedSubcategory) {
      return predefinedSubcategory.label;
    }
    return value;
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
            <DrawerHeader className="flex flex-col gap-1 font-heading tracking-tight">
              <div className="flex items-center gap-2">
                <TrendingDown className="text-primary" size={24} />
                <span>
                  {isEditMode ? 'Edit Expense Record' : 'Add Expense Record'}
                </span>
              </div>
              <p className="text-xs text-default-500 mt-1">
                {isEditMode
                  ? 'Update expense information'
                  : 'Record expenses from various categories'}
              </p>
            </DrawerHeader>

            <DrawerBody className="gap-4">
              {/* Category Dropdown */}
              <DropdownInput
                isRequired
                control={methods.control}
                items={expensesCategories}
                label="Category"
                name="category"
                placeholder="Select expense category"
                description={categoryDescription}
              />

              {/* Sub Category Autocomplete */}
              <AutocompleteInput
                isRequired
                control={methods.control}
                getOptionLabel={item => item.label}
                getOptionValue={item => item.value}
                items={availableSubCategories}
                description={categoryNote}
                label="Sub Category"
                name="subCategory"
                placeholder="Select or type custom sub category"
                disallowTyping={false}
              />

              {/* Amount */}
              <NumberInput
                isRequired
                control={methods.control}
                description="Enter expense amount"
                label="Amount"
                name="amount"
                placeholder="0.00"
                step={1000}
                startContent={
                  <span className="text-default-400 text-sm">₦</span>
                }
              />

              {/* Payment Methods */}
              <DropdownInput
                isRequired
                control={methods.control}
                items={paymentMethods}
                label="Payment Method"
                name="paymentMethod"
                placeholder="Select payment method"
              />

              {/* Reference */}
              <TextInput
                control={methods.control}
                label="Reference (Optional)"
                name="reference"
                placeholder="e.g., TXN123456"
              />

              {/* Vendor Name */}
              <TextInput
                control={methods.control}
                label="Vendor Name (Optional)"
                name="vendorName"
                placeholder="Enter vendor name"
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
                placeholder="Add notes about this expense"
              />

              {/* Receipt */}
              <TextInput
                control={methods.control}
                label="Receipt (Optional)"
                name="receipt"
                placeholder="Enter receipt number or reference"
              />

              {/* Summary */}
              <div className="bg-primary-50 p-4 rounded-lg border border-primary-200">
                <p className="text-sm font-medium text-primary-900">
                  Expense Summary
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-default-600">Category:</span>
                    <span className="font-medium">
                      {expensesCategories.find(c => c.value === watchCategory)
                        ?.label || 'Not selected'}
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
                    <span className="text-default-600">Deductible:</span>
                    <span className="font-medium">
                      {watchIsDeductible ? 'Yes' : 'No'}
                    </span>
                  </div>
                  {watchIsDeductible && (
                    <div className="flex justify-between text-xs">
                      <span className="text-default-600">Deduction:</span>
                      <span className="font-medium">
                        {watch('deductionPercentage') || 0}%
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-default-600">Amount:</span>
                    <span className="font-medium text-primary">
                      {formatCurrency(watchAmount || 0)}
                    </span>
                  </div>
                </div>
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
                {isEditMode ? 'Update Expense' : 'Add Expense'}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </form>
      </FormProvider>
    </Drawer>
  );
}
