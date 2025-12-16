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

import { api } from '@/lib/axios';
import { FormSkeleton } from '@/components/skeleton/FormSkeleton';
import { addLoanSchema } from '@/lib/validations/loan';
import { useLoanStore } from '@/store/loan-store';
import { AddLoanType } from '@/types/loan';

import { LoanPartyDetails } from '../dashboard/loan/LoanPartyDetails';
import { LoanTermsAndCharges } from '../dashboard/loan/LoanTermsAndCharges';
import { LoanSummary } from '../dashboard/loan/LoanSummary';

interface CreateLoanDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  loanId?: string | null;
}

export function CreateLoanDrawer({
  isOpen,
  onClose,
  onSuccess,
  loanId,
}: CreateLoanDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const TOTAL_STEPS = 2;
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

  const { allLoans, updateLoan, addLoan } = useLoanStore();

  const isEditMode = !!loanId;

  const methods = useForm<AddLoanType>({
    resolver: zodResolver(addLoanSchema) as Resolver<AddLoanType>,
    defaultValues: {
      loanType: 'PAYABLE',
      partyName: '',
      partyEmail: '',
      partyPhone: '',
      principalAmount: 0,
      interestRate: 0,
      processingFee: 0,
      managementFee: 0,
      insuranceFee: 0,
      otherCharges: 0,
      startDate: new Date().toISOString().split('T')[0],
      term: undefined,
      termUnit: 'MONTHS',
      paymentFrequency: 'MONTHLY',
      purpose: '',
      collateral: '',
      notes: '',
    },
    mode: 'onChange',
  });

  const { handleSubmit, reset, trigger, formState } = methods;

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setIsLoading(false);

      if (isEditMode && loanId) {
        setIsLoading(true);
        const loan = allLoans.find(l => l.id === loanId);

        if (loan) {
          reset({
            loanType: loan.loanType,
            partyName: loan.partyName || '',
            partyEmail: loan.partyEmail || '',
            partyPhone: loan.partyPhone || '',
            principalAmount: loan.principalAmount,
            interestRate: loan.interestRate,
            processingFee: loan.processingFee || 0,
            managementFee: loan.managementFee || 0,
            insuranceFee: loan.insuranceFee || 0,
            otherCharges: loan.otherCharges || 0,
            startDate: loan.startDate.split('T')[0],
            term: loan.term || undefined,
            termUnit: loan.termUnit || 'MONTHS',
            paymentFrequency: loan.paymentFrequency,
            purpose: loan.purpose || '',
            collateral: loan.collateral || '',
            notes: loan.notes || '',
          });
        }
        setIsLoading(false);
      } else {
        reset({
          loanType: 'PAYABLE',
          partyName: '',
          partyEmail: '',
          partyPhone: '',
          principalAmount: 0,
          interestRate: 0,
          processingFee: 0,
          managementFee: 0,
          insuranceFee: 0,
          otherCharges: 0,
          startDate: new Date().toISOString().split('T')[0],
          term: undefined,
          termUnit: 'MONTHS',
          paymentFrequency: 'MONTHLY',
          purpose: '',
          collateral: '',
          notes: '',
        });
      }
    }
  }, [isOpen, loanId, isEditMode, allLoans, reset]);

  const handleClose = () => {
    onClose();
    setCurrentStep(1);
  };

  const getFirstError = () => {
    const errors = formState.errors;

    // Get all field names from the schema to ensure type safety
    type AddLoanKeys = keyof AddLoanType;
    const fieldNames: AddLoanKeys[] = [
      'loanType',
      'partyName',
      'partyEmail',
      'partyPhone',
      'principalAmount',
      'interestRate',
      'processingFee',
      'managementFee',
      'insuranceFee',
      'otherCharges',
      'startDate',
      'term',
      'termUnit',
      'paymentFrequency',
      'purpose',
      'collateral',
      'notes',
    ];

    for (const fieldName of fieldNames) {
      const error = errors[fieldName];
      if (error && typeof error.message === 'string') {
        return error.message;
      }
    }

    return 'Please fix the errors before proceeding';
  };

  const validateStep = async (step: number): Promise<boolean> => {
    let fieldsToValidate: (keyof AddLoanType)[] = [];

    switch (step) {
      case 1:
        fieldsToValidate = ['loanType', 'partyName'];
        break;
      case 2:
        fieldsToValidate = [
          'principalAmount',
          'interestRate',
          'startDate',
          'paymentFrequency',
          'term',
          'termUnit',
        ];
        break;
    }

    // Convert to readonly array as expected by trigger
    const result = await trigger(
      fieldsToValidate as ReadonlyArray<keyof AddLoanType>
    );

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

  const onSubmit = async (data: AddLoanType) => {
    if (stepRef.current !== TOTAL_STEPS) return;
    setIsSubmitting(true);
    try {
      const loanData = {
        ...data,
        startDate: new Date(data.startDate).toISOString(),
      };

      if (isEditMode && loanId) {
        const response = await api.patch(`/loans/${loanId}`, loanData);

        updateLoan(loanId, response.data.loan);

        addToast({
          title: 'Success!',
          description: 'Loan updated successfully',
          color: 'success',
        });
      } else {
        const response = await api.post('/loans', loanData);

        if (response.data.loan) {
          addLoan(response.data.loan);
        }

        addToast({
          title: 'Success!',
          description: 'Loan created successfully',
          color: 'success',
        });
      }

      handleClose();

      if (onSuccess) {
        await onSuccess();
      }
    } catch (error: any) {
      console.error('Error creating/updating loan:', error);
      addToast({
        title: 'Error',
        description: error?.response?.data?.message || 'Failed to save loan',
        color: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <LoanPartyDetails />;
      case 2:
        return (
          <div className="space-y-4">
            <LoanTermsAndCharges />
            <LoanSummary />
          </div>
        );
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return 'Party Details';
      case 2:
        return 'Loan Terms & Summary';
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
                {isEditMode ? 'Edit Loan' : 'Create New Loan'}
              </h3>
              <div className="flex items-center justify-between w-full mt-2">
                <p className="text-xs text-default-500">
                  Step {currentStep} of {TOTAL_STEPS}: {getStepTitle()}
                </p>
                <div className="flex gap-1">
                  {[1, 2].map(step => (
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
            <DrawerBody className="px-3">
              {isLoading ? (
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
