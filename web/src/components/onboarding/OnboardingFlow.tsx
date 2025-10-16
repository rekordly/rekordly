"use client";
import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { CheckIcon } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { ProgressBar } from '@/components/onboarding/ui/ProgressBar';
import { SignOutButton } from '@/components/onboarding/ui/SignOutButton';
import { Step1PersonalInfo } from '@/components/onboarding/steps/Step1PersonalInfo';
import { Step2WorkType } from '@/components/onboarding/steps/Step2WorkType';
import { Step3Details } from '@/components/onboarding/steps/Step3Details';

import { 
  personalInfoSchema, 
  workTypeSchema, 
  confirmationSchema,
  getWorkTypeSchema
} from '@/lib/validations/onboarding';


type FormErrors = {
  [key: string]: string;
};

const OnboardingFlow = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    heardFrom: '',
    referralCode: '',
    workType: '',
    confirmAccuracy: false,
    confirmNotifications: false,
    confirmTerms: false
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateStep = (step: number) => {
    const newErrors: FormErrors = {};

    if (step === 1) {
      const result = personalInfoSchema.safeParse(formData);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          // Now TypeScript knows that newErrors can be indexed with a string
          const field = issue.path[0];
          if (typeof field === 'string') {
            newErrors[field] = issue.message;
          }
        });
      }
    }

    if (step === 2) {
      const result = workTypeSchema.safeParse(formData);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          const field = issue.path[0];
          if (typeof field === 'string') {
            newErrors[field] = issue.message;
          }
        });
      }
    }

    if (step === 3) {
      // Validate work type specific fields
      const workTypeSchema = getWorkTypeSchema(formData.workType);
      const workTypeResult = workTypeSchema.safeParse(formData);
      
      if (!workTypeResult.success) {
        workTypeResult.error.issues.forEach(issue => {
          const field = issue.path[0];
          if (typeof field === 'string') {
            newErrors[field] = issue.message;
          }
        });
      }
      
      // Validate confirmation checkboxes
      const confirmationResult = confirmationSchema.safeParse(formData);
      if (!confirmationResult.success) {
        confirmationResult.error.issues.forEach(issue => {
          const field = issue.path[0];
          if (typeof field === 'string') {
            newErrors[field] = issue.message;
          }
        });
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
    setErrors({});
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;
    console.log("Final form data:", formData);

    // setIsSubmitting(true);
    // try {
    //   const response = await fetch('/api/onboarding', {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify(formData),
    //   });

    //   if (response.ok) {
    //     window.location.href = '/dashboard';
    //   } else {
    //     const error = await response.json();
    //     alert(error.message || 'Something went wrong');
    //   }
    // } catch (error) {
    //   alert('Network error. Please try again.');
    // } finally {
    //   setIsSubmitting(false);
    // }
  };

  const handleSignOut = () => signOut({ callbackUrl: '/account' });
  

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Gradient/Image (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500 items-center justify-center p-12 relative">
        <div className="text-white text-center max-w-lg">
          <h1 className="text-5xl font-bold mb-6">Welcome to rekordly</h1>
          <p className="text-xl mb-8 opacity-90">
            "Take control of your finances. Track every naira, maximize every opportunity."
          </p>
          <div className="flex items-center justify-center gap-2">
            <CheckIcon className="w-6 h-6" />
            <span className="text-lg">Smart income tracking</span>
          </div>
          <div className="flex items-center justify-center gap-2 mt-4">
            <CheckIcon className="w-6 h-6" />
            <span className="text-lg">Tax calculations made easy</span>
          </div>
          <div className="flex items-center justify-center gap-2 mt-4">
            <CheckIcon className="w-6 h-6" />
            <span className="text-lg">Financial insights at your fingertips</span>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
        <SignOutButton onSignOut={handleSignOut} />
        
        <div className="w-full max-w-md">
          <ProgressBar step={currentStep} />

          {/* Step Content */}
          <div className="mb-8">
            {currentStep === 1 && (
              <Step1PersonalInfo 
                formData={formData} 
                setFormData={setFormData} 
                errors={errors}
              />
            )}
            
            {currentStep === 2 && (
              <Step2WorkType 
                formData={formData} 
                setFormData={setFormData} 
                errors={errors}
              />
            )}
            
            {currentStep === 3 && (
              <Step3Details 
                formData={formData} 
                setFormData={setFormData} 
                errors={errors}
              />
            )}
          </div>

          {/* Navigation Buttons */}
          <div className="flex gap-4">
            {currentStep > 1 && (
              <Button
                variant="bordered"
                onPress={handleBack}
                className="flex-1 h-12 rounded-xl"
              >
                Back
              </Button>
            )}
            
            {currentStep < 3 ? (
              <Button
                color="primary"
                onPress={handleNext}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600"
              >
                Next
              </Button>
            ) : (
              <Button
                color="primary"
                onPress={handleSubmit}
                isLoading={isSubmitting}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600"
              >
                Complete Onboarding
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;