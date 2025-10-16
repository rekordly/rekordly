import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { RadioGroup } from '@heroui/react';
import { CustomRadio } from '../ui/CustomRadio';
import { workTypes } from '../constant';

export const Step2WorkType: React.FC = () => {
  const { control, formState: { errors } } = useFormContext();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6">How do you earn income?</h2>
      
      <Controller
        name="workType"
        control={control}
        render={({ field }) => (
          <RadioGroup
            value={field.value}
            onValueChange={field.onChange}
          >
            {workTypes.map((type) => (
              <CustomRadio 
                key={type.value} 
                value={type.value}
                description={type.desc}
              >
                {type.label}
              </CustomRadio>
            ))}
          </RadioGroup>
        )}
      />
      
      {errors.workType && (
        <p className="text-danger text-sm">{errors.workType.message as string}</p>
      )}
    </div>
  );
};