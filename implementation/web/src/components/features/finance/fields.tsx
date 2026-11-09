"use client";

// Form fields bound to react-hook-form, so drawers stay short and consistent.

import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { AppInput } from "@/components/ui/app-input";
import { AppSelect, type AppSelectOption } from "@/components/ui/app-select";
import { AppTextarea } from "@/components/ui/app-textarea";
import { MoneyInput } from "@/components/ui/money-input";

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  isRequired?: boolean;
}

export function TextInputField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  isRequired,
  type = "text",
  description,
}: BaseProps<T> & { type?: "text" | "email" | "tel" | "date"; description?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AppInput
          label={label}
          type={type}
          placeholder={placeholder}
          isRequired={isRequired}
          description={description}
          value={field.value ?? ""}
          onChange={(event) => field.onChange(event.target.value)}
          onBlur={field.onBlur}
          ref={field.ref}
          errorMessage={fieldState.error?.message}
        />
      )}
    />
  );
}

export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder = "0.00",
  isRequired,
  currency,
  exponent,
  description,
}: BaseProps<T> & { currency: string; exponent?: number; description?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <MoneyInput
          label={label}
          placeholder={placeholder}
          isRequired={isRequired}
          currency={currency}
          exponent={exponent}
          description={description}
          value={field.value ?? ""}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          errorMessage={fieldState.error?.message}
        />
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  options,
  isRequired,
}: BaseProps<T> & { options: AppSelectOption[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AppSelect
          label={label}
          placeholder={placeholder}
          options={options}
          isRequired={isRequired}
          selectedKey={field.value || undefined}
          onSelectionChange={field.onChange}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

export function NotesField<T extends FieldValues>({ control, name, label, placeholder }: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AppTextarea
          label={label}
          placeholder={placeholder}
          value={field.value ?? ""}
          onChange={(event) => field.onChange(event.target.value)}
          onBlur={field.onBlur}
          errorMessage={fieldState.error?.message}
        />
      )}
    />
  );
}
