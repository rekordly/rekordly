"use client";
import React, { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@heroui/react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ProgressBar } from '@/components/onboarding/ui/ProgressBar';
import { SignOutButton } from '@/components/onboarding/ui/SignOutButton';
import { Step1PersonalInfo } from '@/components/onboarding/steps/Step1PersonalInfo';
import { Step2WorkType } from '@/components/onboarding/steps/Step2WorkType';
import { Step3Details } from '@/components/onboarding/steps/Step3Details';
import { 
  personalInfoSchema,
  personalInfoSchemaWithPassword, 
  workTypeSchema, 
  getWorkTypeSchema
} from '@/lib/validations/onboarding';
import { z } from 'zod';

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
  workType: string;
  registrationType?: string;
  businessName?: string;
  startDate: string;
  confirmNotifications?: boolean;
  confirmTerms: boolean;
};

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ user }) => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Function to get the appropriate schema for the current step
  const getSchemaForStep = (step: number, workType?: string) => {
    if (step === 1) {
      return user.hasPassword ? personalInfoSchema : personalInfoSchemaWithPassword;
    } else if (step === 2) {
      return workTypeSchema;
    } else if (step === 3) {
      // Base schema for step 3
      const baseSchema = z.object({
        startDate: z.string().min(1, { message: 'Please select a start date' }),
        confirmTerms: z.boolean().refine(val => val === true, { 
          message: 'Please accept the terms and conditions' 
        }),
      });
      
      // Add work type specific fields
      if (workType && workType !== 'remote-worker') {
        return baseSchema.merge(z.object({
          registrationType: z.string().min(1, { message: 'Please select a registration type' }),
        }));
      }
      
      return baseSchema;
    }
    return z.object({});
  };

  const methods = useForm<FormData>({
    resolver: zodResolver(getSchemaForStep(currentStep)) as any,
    mode: 'onBlur',
    defaultValues: {
      fullName: user.name || '',
      phoneNumber: '',
      email: user.email || '',
      password: '',
      confirmPassword: '',
      heardFrom: '',
      referralCode: '',
      workType: '',
      registrationType: '',
      businessName: '',
      startDate: '',
      confirmNotifications: false,
      confirmTerms: true,
    },
  });

  // Update form resolver when step changes
  useEffect(() => {
    const workType = methods.getValues('workType');
    methods.reset(
      methods.getValues(),
      {
        keepErrors: false,
        keepDirty: true,
        keepValues: true,
        resolver: zodResolver(getSchemaForStep(currentStep, workType)) as any,
      }
    );
  }, [currentStep, methods]);

  const handleNext = async () => {
    console.log('Current Step:', currentStep);
    const workType = methods.getValues('workType');
    
    // Validate all fields for the current step
    const isValid = await methods.trigger();
    
    if (isValid) {
      if (currentStep === 2 && workType === 'remote-worker') {
        // Set defaults for remote workers
        methods.setValue('registrationType', 'N/A');
        methods.setValue('businessName', 'N/A');
      }
      
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
    methods.clearErrors();
  };

  const onSubmit = async (data: FormData) => {
    console.log('Submitting Data:', data);
    setIsSubmitting(true);
    try {
      // Get all form values to ensure all fields are included
      const formData = methods.getValues();
      const response = await fetch('/api/onboarding1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/dashboard');
      } else {
        const error = await response.json();
        alert(error.message || 'Something went wrong');
      }
    } catch (error) {
      alert('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = () => signOut({ callbackUrl: '/account' });

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
                    hasPassword={user.hasPassword}
                    emailDisabled={!!user.email}
                  />
                )}
                
                {currentStep === 2 && <Step2WorkType />}
                
                {currentStep === 3 && <Step3Details />}
              </div>

              {/* Navigation Buttons */}
              <div className="flex gap-4">
                {currentStep > 1 && (
                  <Button
                    type="button"
                    variant="bordered"
                    onPress={handleBack}
                    className="flex-1 h-12 rounded-xl"
                  >
                    Back
                  </Button>
                )}
                
                {currentStep < 3 ? (
                  <Button
                    type="button"
                    color="primary"
                    onPress={handleNext}
                    className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600"
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    color="primary"
                    isLoading={isSubmitting}
                    className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600"
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