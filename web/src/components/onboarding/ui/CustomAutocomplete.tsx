import React from 'react';
import { Autocomplete, AutocompleteItem } from '@heroui/react';

interface CustomAutocompleteProps {
  label: string;
  options: string[];
  error?: string;
  [key: string]: any;
}

export const CustomAutocomplete = ({ label, options, error, ...props }: CustomAutocompleteProps) => (
  <div className="mb-4">
    <Autocomplete
      label={label}
      variant="bordered"
      classNames={{
        base: "border-1 border-default-300 rounded-2xl",
        // label: "font-light text-default-400"
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
  </div>
);