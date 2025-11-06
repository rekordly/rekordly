import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Select, SelectItem } from '@heroui/react';

interface CustomMultiSelectProps {
  label: string;
  name: string;
  options: Array<{ key: string; label: string }>;
  error?: string;
}

export const CustomMultiSelect: React.FC<CustomMultiSelectProps> = ({
  label,
  name,
  options,
  error,
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
            selectedKeys={field.value || []}
            selectionMode="multiple"
            variant="bordered"
            onSelectionChange={keys => field.onChange(Array.from(keys))}
          >
            {options.map(option => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
        )}
      />
    </div>
  );
};
