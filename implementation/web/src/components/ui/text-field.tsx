"use client";

import {
  cn,
  Input as HeroInput,
  InputGroup as HeroInputGroup,
  TextField as HeroTextField,
} from "@heroui/react";
import { type FocusEventHandler, type HTMLAttributes, type ReactNode, type Ref, useId } from "react";

import { FormField, getFormFieldAccessibilityIds } from "./form-field";

export type RekordlyInputType = "text" | "email" | "password" | "tel" | "url";

export interface TextFieldProps {
  id?: string;
  name?: string;
  label: string;
  type?: RekordlyInputType;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  labelAction?: ReactNode;
  startAddon?: ReactNode;
  endAddon?: ReactNode;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  "data-testid"?: string;
}

export function TextField({
  id,
  name,
  label,
  type = "text",
  value,
  defaultValue,
  placeholder,
  description,
  errorMessage,
  isInvalid = false,
  isDisabled = false,
  isReadOnly = false,
  isRequired = false,
  autoComplete,
  autoFocus = false,
  inputMode,
  labelAction,
  startAddon,
  endAddon,
  onChange,
  onBlur,
  inputRef,
  className,
  "data-testid": dataTestId,
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? (name ? `field-${name}` : `field-${generatedId}`);
  const hasError = Boolean(errorMessage) || isInvalid;
  const { labelId, ariaDescribedBy } = getFormFieldAccessibilityIds(fieldId, {
    hasDescription: Boolean(description),
    hasError: Boolean(errorMessage),
  });

  const handleNativeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(event.target.value);
  };

  return (
    <HeroTextField
      name={name}
      type={type}
      value={value}
      defaultValue={defaultValue}
      isInvalid={hasError}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      onChange={onChange}
      fullWidth
      className={cn("w-full", className)}
    >
      <FormField
        id={fieldId}
        label={label}
        description={description}
        errorMessage={errorMessage}
        isInvalid={hasError}
        isDisabled={isDisabled}
        isRequired={isRequired}
        labelAction={labelAction}
      >
        <HeroInputGroup
          fullWidth
          variant="primary"
          isInvalid={hasError}
          isDisabled={isDisabled}
          className={cn(
            "flex h-11 min-h-11 w-full items-center rounded-xl border bg-[var(--field-background)] px-3.5 shadow-none outline-none transition-colors",
            hasError
              ? "border-danger focus-within:border-danger"
              : "border-border hover:border-primary/45 focus-within:border-primary",
            isDisabled && "cursor-not-allowed bg-surface-muted opacity-65",
            isReadOnly && "bg-surface-muted",
          )}
        >
          {startAddon ? (
            <HeroInputGroup.Prefix className="mr-2 flex shrink-0 items-center text-muted-foreground">
              {startAddon}
            </HeroInputGroup.Prefix>
          ) : null}

          <HeroInput
            ref={inputRef}
            id={fieldId}
            name={name}
            type={type}
            value={value}
            defaultValue={defaultValue}
            placeholder={placeholder}
            disabled={isDisabled}
            readOnly={isReadOnly}
            required={isRequired}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            inputMode={inputMode}
            aria-labelledby={labelId}
            aria-describedby={ariaDescribedBy}
            aria-invalid={hasError || undefined}
            onChange={handleNativeChange}
            onBlur={onBlur}
            data-testid={dataTestId}
            className={cn(
              "h-full w-full flex-1 border-0 bg-transparent px-0.5 font-sans text-sm text-foreground shadow-none placeholder:text-muted-foreground",
              "focus:ring-0 focus:outline-none",
              "disabled:cursor-not-allowed",
            )}
          />

          {endAddon ? (
            <HeroInputGroup.Suffix className="ml-2 flex shrink-0 items-center">
              {endAddon}
            </HeroInputGroup.Suffix>
          ) : null}
        </HeroInputGroup>
      </FormField>
    </HeroTextField>
  );
}
