import React from 'react';
import { Autocomplete, AutocompleteItem } from '@heroui/react';
import { useFormContext, Controller } from 'react-hook-form';

interface CustomAutocompleteProps {
  label: string;
  options: string[];
  error?: string;
  name: string;
  allowsCustomValue?: boolean;
  [key: string]: any;
}

export const CustomAutocomplete: React.FC<CustomAutocompleteProps> = ({
  label,
  options,
  error,
  name,
  allowsCustomValue = false,
  ...props
}) => {
  const { control } = useFormContext();

  return (
    <div className="mb-4">
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Autocomplete
            allowsCustomValue={allowsCustomValue}
            classNames={{
              base: 'border-1 border-default-300 rounded-2xl',
            }}
            errorMessage={error}
            isInvalid={!!error}
            label={label}
            selectedKey={field.value}
            variant="bordered"
            onInputChange={value => {
              if (allowsCustomValue) {
                field.onChange(value);
              }
            }}
            onSelectionChange={field.onChange}
            {...props}
          >
            {options.map(option => (
              <AutocompleteItem key={option}>{option}</AutocompleteItem>
            ))}
          </Autocomplete>
        )}
      />
    </div>
  );
};
