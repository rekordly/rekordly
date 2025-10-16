import React, { forwardRef } from 'react';
import { Input } from '@heroui/react';

interface CustomInputProps {
  label: string;
  error?: string;
  [key: string]: any;
}

export const CustomInput = forwardRef<HTMLInputElement, CustomInputProps>(
  ({ label, error, ...props }, ref) => (
    <div className="mb-4">
      <Input
        ref={ref}
        label={label}
        variant="bordered"
        color='primary'
        classNames={{
          inputWrapper: "border-1 h-14 border-default-300 rounded-2xl",
          label: "font-light text-default-400"
        }}
        isInvalid={!!error}
        errorMessage={error}
        {...props}
      />
    </div>
  )
);

CustomInput.displayName = 'CustomInput';