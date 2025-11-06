import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Checkbox } from '@heroui/react';

import { CustomInput } from '../ui/CustomInput';
import { CustomSelect } from '../ui/CustomSelect';
import { registrationTypes } from '../constant';

export const Step3Details: React.FC = () => {
  const {
    watch,
    register,
    control,
    formState: { errors },
  } = useFormContext();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6">Tell us more</h2>

      <CustomInput
        label="When did you start?"
        type="date"
        {...register('startDate', {
          required: 'Please select a start date',
          valueAsDate: false,
        })}
        isRequired
        error={errors.startDate?.message as string}
      />

      <CustomSelect
        isRequired
        error={errors.registrationType?.message as string}
        label="Business Registration Type"
        name="registrationType"
        options={registrationTypes.full}
      />

      <CustomInput
        label="Business/Company Name (Optional)"
        {...register('businessName')}
        error={errors.businessName?.message as string}
      />

      {/* Final Confirmation */}
      <div className="space-y-4 mt-6 pt-6 border-t border-default-200">
        <h3 className="font-semibold text-lg mb-4">Final Confirmation</h3>

        {/* Newsletter - Optional, can be changed */}
        <Controller
          control={control}
          name="confirmNotifications"
          render={({ field }) => (
            <Checkbox
              classNames={{
                base: 'max-w-full',
              }}
              isSelected={field.value}
              onValueChange={field.onChange}
            >
              <span className="text-sm">
                I want to receive notifications about tax deadlines and
                financial tips
              </span>
            </Checkbox>
          )}
        />

        {/* Terms - Required, checked by default, cannot be unchecked */}
        <Controller
          control={control}
          name="confirmTerms"
          render={({ field }) => (
            <Checkbox
              classNames={{
                base: 'max-w-full',
              }}
              isSelected={field.value}
              onValueChange={field.onChange}
            >
              <span className="text-sm">
                I agree to the{' '}
                <a
                  className="text-primary underline"
                  href="/terms"
                  target="_blank"
                >
                  Terms of Service
                </a>{' '}
                and{' '}
                <a
                  className="text-primary underline"
                  href="/privacy"
                  target="_blank"
                >
                  Privacy Policy
                </a>
              </span>
            </Checkbox>
          )}
          rules={{ required: 'You must accept the terms and conditions' }}
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
