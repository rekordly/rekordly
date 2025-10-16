import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Checkbox } from '@heroui/react';

export const FinalConfirmation: React.FC = () => {
  const { control, formState: { errors } } = useFormContext();

  return (
    <div className="space-y-4 mt-6 pt-6 border-t border-default-200">
      <h3 className="font-semibold text-lg mb-4">Final Confirmation</h3>
      
      <Controller
        name="confirmAccuracy"
        control={control}
        render={({ field }) => (
          <Checkbox
            isSelected={field.value}
            onValueChange={field.onChange}
            classNames={{
              base: "max-w-full gap-2 mb-1.5",
            }}
          >
            <span className="text-sm">
              I confirm that all the information provided is accurate and up-to-date
            </span>
          </Checkbox>
        )}
      />
      {errors.confirmAccuracy && (
        <p className="text-danger text-xs ml-7">
          {errors.confirmAccuracy.message as string}
        </p>
      )}

      <Controller
        name="confirmNotifications"
        control={control}
        render={({ field }) => (
          <Checkbox
            isSelected={field.value}
            onValueChange={field.onChange}
            classNames={{
              base: "max-w-full gap-2 mb-1.5",
            }}
          >
            <span className="text-sm">
              I want to receive notifications about tax deadlines and financial tips (Optional)
            </span>
          </Checkbox>
        )}
      />

      <Controller
        name="confirmTerms"
        control={control}
        render={({ field }) => (
          <Checkbox
            isSelected={field.value}
            onValueChange={field.onChange}
            classNames={{
              base: "max-w-full gap-2",
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
  );
};