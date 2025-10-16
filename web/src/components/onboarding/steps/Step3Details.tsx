import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Checkbox } from '@heroui/react';
import { CustomInput } from '../ui/CustomInput';
import { CustomSelect } from '../ui/CustomSelect';
import { registrationTypes } from '../constant';

export const Step3Details: React.FC = () => {
  const { watch, register, control, formState: { errors } } = useFormContext();
  const workType = watch('workType');
  
  // Remote workers don't need registration type or business name
  const showRegistrationFields = workType !== 'remote-worker';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6">Tell us more</h2>
      
      {/* Registration Type - Hidden for remote workers */}
      {showRegistrationFields && (
        <CustomSelect
          label="Business Registration Type"
          name="registrationType"
          options={registrationTypes.basic}
          error={errors.registrationType?.message as string}
          isRequired={workType !== 'remote-worker'}
        />
      )}

      {/* Business Name - Hidden for remote workers */}
      {showRegistrationFields && (
        <CustomInput
          label="Business/Company Name (Optional)"
          {...register('businessName')}
          error={errors.businessName?.message as string}
        />
      )}

      {/* Start Date - For everyone */}
      <CustomInput
        label="When did you start?"
        type="date"
        {...register('startDate', { 
          required: 'Please select a start date',
          valueAsDate: false 
        })}
        error={errors.startDate?.message as string}
        isRequired
      />

      {/* Final Confirmation */}
      <div className="space-y-4 mt-6 pt-6 border-t border-default-200">
        <h3 className="font-semibold text-lg mb-4">Final Confirmation</h3>
        
        {/* Newsletter - Optional, can be changed */}
        <Controller
          name="confirmNotifications"
          control={control}
          render={({ field }) => (
            <Checkbox
              isSelected={field.value}
              onValueChange={field.onChange}
              classNames={{
                base: "max-w-full",
              }}
            >
              <span className="text-sm">
                I want to receive notifications about tax deadlines and financial tips
              </span>
            </Checkbox>
          )}
        />

        {/* Terms - Required, checked by default, cannot be unchecked */}
        <Controller
          name="confirmTerms"
          control={control}
          rules={{ required: 'You must accept the terms and conditions' }}
          render={({ field }) => (
            <Checkbox
              isSelected={field.value}
              onValueChange={field.onChange}
              classNames={{
                base: "max-w-full",
              }}
            >
              <span className="text-sm">
                I agree to the{' '}
                <a href="/terms" target="_blank" className="text-primary underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" className="text-primary underline">
                  Privacy Policy
                </a>
              </span>
            </Checkbox>
          )}
        />
        {errors.confirmTerms && (
          <p className="text-danger text-xs ml-7">
            {errors.confirmTerms.message as string}
          </p>
        )}
      </div>
    </div>
  );
};