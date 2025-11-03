import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { CheckboxGroup, Checkbox } from '@heroui/react';
import { workTypes } from '../constant';

export const Step2WorkType: React.FC = () => {
  const {
    control,
    formState: { errors },
  } = useFormContext();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6">How do you earn income?</h2>

      <Controller
        name="workTypes"
        control={control}
        render={({ field }) => (
          <CheckboxGroup value={field.value} onChange={field.onChange}>
            {workTypes.map(type => (
              <Checkbox key={type.value} value={type.value}>
                <span className="font-medium">{type.label}</span>
                <p className="text-sm text-gray-500">{type.desc}</p>
              </Checkbox>
            ))}
          </CheckboxGroup>
        )}
      />

      {errors.workTypes && (
        <p className="text-danger text-sm">
          {errors.workTypes.message as string}
        </p>
      )}
    </div>
  );
};
