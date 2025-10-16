import React from 'react';
import { Select, SelectItem } from '@heroui/react';

interface CustomSelectProps {
  label: string;
  options: string[];
  error?: string;
  [key: string]: any;
}

export const CustomSelect = ({ label, options, error, ...props }: CustomSelectProps) => (
  <div className="mb-4">
    <Select
      label={label}
      variant="bordered"
      classNames={{
        trigger: "border-1 h-14 border-default-300 rounded-2xl",
        label: "font-light text-default-400"
      }}
      isInvalid={!!error}
      errorMessage={error}
      {...props}
    >
      {options.map((option) => (
        <SelectItem key={option} value={option}>
          {option}
        </SelectItem>
      ))}
    </Select>
  </div>
);