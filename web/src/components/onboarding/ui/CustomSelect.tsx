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
        name={name}
        control={control}
        rules={{ required: isRequired ? `${label} is required` : false }}
        render={({ field }) => (
          <Select
            label={label}
            variant="bordered"
            selectedKeys={field.value ? [field.value] : []}
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0] as string;
              field.onChange(value);
            }}
            classNames={{
              trigger: "border-1 h-14 border-default-300 rounded-2xl",
              label: "font-light text-default-400"
            }}
            isInvalid={!!error}
            errorMessage={error}
            {...props}
          >
            {options.map((option) => (
              <SelectItem key={option}>
                {option}
              </SelectItem>
            ))}
          </Select>
        )}
      />
    </div>
  );
};