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
        name={name}
        control={control}
        render={({ field }) => (
          <Autocomplete
            label={label}
            variant="bordered"
            selectedKey={field.value}
            onSelectionChange={field.onChange}
            allowsCustomValue={allowsCustomValue}
            onInputChange={(value) => {
              if (allowsCustomValue) {
                field.onChange(value);
              }
            }}
            classNames={{
              base: "border-1 border-default-300 rounded-2xl",
            }}
            isInvalid={!!error}
            errorMessage={error}
            {...props}
          >
            {options.map((option) => (
              <AutocompleteItem key={option}>
                {option}
              </AutocompleteItem>
            ))}
          </Autocomplete>
        )}
      />
    </div>
  );
};