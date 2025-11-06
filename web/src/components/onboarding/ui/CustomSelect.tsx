import React from 'react';
import { Select, SelectItem } from '@heroui/react';
import { useFormContext, Controller } from 'react-hook-form';

interface CustomSelectProps {
  label: string;
  options: string[];
  error?: string;
  name: string;
  isRequired?: boolean;
  [key: string]: any;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  options,
  error,
  name,
  isRequired,
  ...props
}) => {
  const { control } = useFormContext();

  return (
    <div className="mb-4">
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            classNames={{
              trigger: 'border-1 h-14 border-default-300 rounded-2xl',
              label: 'font-light text-default-400',
            }}
            errorMessage={error}
            isInvalid={!!error}
            label={label}
            selectedKeys={field.value ? [field.value] : []}
            variant="bordered"
            onSelectionChange={keys => {
              const value = Array.from(keys)[0] as string;

              field.onChange(value);
            }}
            {...props}
          >
            {options.map(option => (
              <SelectItem key={option}>{option}</SelectItem>
            ))}
          </Select>
        )}
        rules={{ required: isRequired ? `${label} is required` : false }}
      />
    </div>
  );
};
