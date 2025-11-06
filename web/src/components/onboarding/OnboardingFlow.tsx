'use client';
import React, { useState } from 'react';
import { useForm, FormProvider, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addToast, Button } from '@heroui/react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { handleSignOut } from '@/lib/auth/logout';
import { ProgressBar } from '@/components/onboarding/ui/ProgressBar';
import { SignOutButton } from '@/components/onboarding/ui/SignOutButton';
import { Step1PersonalInfo } from '@/components/onboarding/steps/Step1PersonalInfo';
import { Step2WorkType } from '@/components/onboarding/steps/Step2WorkType';
import { Step3Details } from '@/components/onboarding/steps/Step3Details';
import {
  personalInfoSchema,
  personalInfoSchemaWithPassword,
  workTypeSchema,
  finalSchema,
} from '@/lib/validations/onboarding';
import { SessionUser } from '@/types/index';
import { useApi } from '@/hooks/useApi';

interface OnboardingFlowProps {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    hasPassword: boolean;
    emailVerified: boolean;
  };
}

type FormData = {
  fullName: string;
  phoneNumber: string;
  email: string;
  password?: string;
  confirmPassword?: string;
  heardFrom: string;
  referralCode?: string;
  workTypes: string[];
  registrationType: string;
  businessName?: string;
  startDate: string;
  confirmNotifications?: boolean;
  confirmTerms: boolean;
};

export const OnboardingFlow: React.FC<SessionUser> = ({ user }) => {
  const router = useRouter();
  const { update } = useSession();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create a combined schema for form validation
  const getCompleteSchema = () => {
    const step1Schema = user.hasPassword
      ? personalInfoSchema
      : personalInfoSchemaWithPassword;

    return step1Schema.merge(workTypeSchema).merge(finalSchema);
  };

  const methods = useForm<FormData>({
    resolver: zodResolver(getCompleteSchema()) as Resolver<FormData>,
    mode: 'onBlur',
    defaultValues: {
      fullName: user.name || '',
      phoneNumber: '',
      email: user.email || '',
      password: '',
      confirmPassword: '',
      heardFrom: '',
      referralCode: '',
      workTypes: [],
      registrationType: '',
      businessName: '',
      startDate: '',
      confirmNotifications: false,
      confirmTerms: true,
    },
  });

  const handleNext = async () => {
    console.log('Current Step:', currentStep);

    let fieldsToValidate: (keyof FormData)[] = [];

    if (currentStep === 1) {
      fieldsToValidate = user.hasPassword
        ? ['fullName', 'phoneNumber', 'email', 'heardFrom']
        : [
            'fullName',
            'phoneNumber',
            'email',
            'password',
            'confirmPassword',
            'heardFrom',
          ];

      const isValid = await methods.trigger(fieldsToValidate);

      if (!isValid) {
        return;
      }

      if (!user.hasPassword) {
        const password = methods.getValues('password');
        const confirmPassword = methods.getValues('confirmPassword');

        if (password !== confirmPassword) {
          methods.setError('confirmPassword', {
            type: 'manual',
            message: "Passwords don't match",
          });

          return;
        }
      }
    } else if (currentStep === 2) {
      fieldsToValidate = ['workTypes'];
      const isValid = await methods.trigger(fieldsToValidate);

      if (!isValid) {
        return;
      }
    }

    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
    methods.clearErrors();
  };

  const { post } = useApi({
    addToast,
    onSuccess: async data => {
      await update();

      addToast({
        title: 'Success!',
        description: data.message || 'Onboarding completed successfully!',
        color: 'success',
      });

      router.push('/dashboard');
      router.refresh();
    },
  });

  const onSubmit = async (data: FormData) => {
    // console.log('Submitting Data:', data);
    setIsSubmitting(true);
    try {
      await post('/onboarding', data);
      await update();
    } catch (error) {
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Progress Bar - Full width on mobile */}
      <div className="lg:hidden w-full">
        <ProgressBar step={currentStep} />
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative">
        <SignOutButton onSignOut={handleSignOut} />

        <div className="w-full max-w-md">
          {/* Progress Bar - Normal on desktop */}
          <div className="hidden lg:block">
            <ProgressBar step={currentStep} />
          </div>

          <FormProvider {...methods}>
            <form onSubmit={methods.handleSubmit(onSubmit)}>
              {/* Step Content */}
              <div className="mb-8">
                {currentStep === 1 && (
                  <Step1PersonalInfo
                    emailDisabled={!!user.email}
                    hasPassword={user.hasPassword}
                  />
                )}

                {currentStep === 2 && <Step2WorkType />}
                {currentStep === 3 && <Step3Details />}
              </div>

              {/* Navigation Buttons */}
              <div className="flex gap-4">
                {currentStep > 1 && (
                  <Button
                    className="flex-1 h-12 rounded-xl"
                    type="button"
                    variant="bordered"
                    onPress={handleBack}
                  >
                    Back
                  </Button>
                )}

                {currentStep < 3 ? (
                  <Button
                    className="flex-1 h-12 rounded-xl bg-gradient-to-r from-primary-800 to-primary-600"
                    color="primary"
                    type="button"
                    onPress={handleNext}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    className="flex-1 h-12 rounded-xl bg-gradient-to-r from-primary-800 to-primary-600"
                    color="primary"
                    isLoading={isSubmitting}
                    type="submit"
                  >
                    Complete Onboarding
                  </Button>
                )}
              </div>
            </form>
          </FormProvider>
        </div>
      </div>
    </div>
  );
};
