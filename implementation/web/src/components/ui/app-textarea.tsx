'use client';


// Textarea field matching `AppInput` style and Rekordly tokens.
// Built on HeroUI v3 <TextField>, <Label>, <TextArea>, <Description>, and <FieldError>.

import React, { forwardRef } from 'react';
import {
  TextField,
  Label,
  TextArea,
  FieldError,
  Description,
} from '@heroui/react';

export interface AppTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Optional form field label */
  label?: string;
  /** Helper description below the textarea */
  description?: string;
  /** Error message to display (triggers isInvalid state) */
  errorMessage?: string;
  /** Explicit error/invalid state */
  isInvalid?: boolean;
  /** Marks field as required */
  isRequired?: boolean;
  /** Disables user input */
  isDisabled?: boolean;
  /** Container wrapper class name */
  containerClassName?: string;
}

export const AppTextarea = forwardRef<HTMLTextAreaElement, AppTextareaProps>(
  function AppTextarea(
    {
      label,
      description,
      errorMessage,
      isInvalid,
      isRequired,
      isDisabled,
      containerClassName,
      className,
      rows = 3,
      id,
      name,
      placeholder,
      value,
      defaultValue,
      onChange,
      ...props
    },
    ref,
  ) {
    const invalid = Boolean(errorMessage) || isInvalid;

    return (
      <TextField
        isInvalid={invalid}
        isRequired={isRequired}
        isDisabled={isDisabled}
        name={name}
        value={value !== undefined ? String(value) : undefined}
        defaultValue={defaultValue !== undefined ? String(defaultValue) : undefined}
        onChange={(val: string) => {
          if (onChange) {
            onChange({
              target: { value: val, name: name ?? '' },
              currentTarget: { value: val, name: name ?? '' },
            } as unknown as React.ChangeEvent<HTMLTextAreaElement>);
          }
        }}
        aria-label={!label ? (props['aria-label'] || placeholder || 'Textarea') : undefined}
        className={`gap-1.5 w-full ${containerClassName ?? ''}`.trim()}
      >
        {label && (
          <Label className="text-[13px] font-medium text-foreground select-none">
            {label}
          </Label>
        )}

        <TextArea
          {...props}
          ref={ref}
          id={id}
          name={name}
          rows={rows}
          placeholder={placeholder}
          disabled={isDisabled}
          required={isRequired}
          data-invalid={invalid || undefined}
          data-disabled={isDisabled || undefined}
          className={`field-shell w-full resize-y p-3.5 text-[14px] shadow-none placeholder:text-field-placeholder ${className ?? ''}`}
        />

        {description && !invalid && (
          <Description className="text-[12px] text-muted">{description}</Description>
        )}

        {errorMessage && (
          <FieldError className="animate-fade-up text-[12px] font-medium text-danger">
            {errorMessage}
          </FieldError>
        )}
      </TextField>
    );
  },
);
