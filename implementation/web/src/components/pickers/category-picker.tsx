"use client";

// Choose an income or expense category, the same way on every screen.
//
//   <CategoryPicker workspaceId direction="money_out" value={id} onChange={setId} />
//   <CategoryField control={form.control} name="category_id" workspaceId direction="money_out" />   (react-hook-form)

import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { AppSelect } from "@/components/ui/app-select";
import { useCategoryOptions } from "@/components/features/finance/shared";

export interface CategoryPickerProps {
  workspaceId: number;
  /** money_out for expenses, money_in for income. */
  direction: "money_in" | "money_out";
  value: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  isRequired?: boolean;
}

export function CategoryPicker({ workspaceId, direction, value, onChange, label, placeholder, error, isRequired }: CategoryPickerProps) {
  const options = useCategoryOptions(workspaceId, direction);
  return (
    <AppSelect
      label={label ?? (direction === "money_out" ? "Expense category" : "Income category")}
      placeholder={placeholder ?? "Choose a category"}
      options={options}
      selectedKey={value || undefined}
      onSelectionChange={onChange}
      error={error}
      isRequired={isRequired}
    />
  );
}

/** react-hook-form version: the form value is the category id as a string. */
export function CategoryField<T extends FieldValues>({
  control,
  name,
  ...props
}: Omit<CategoryPickerProps, "value" | "onChange" | "error"> & { control: Control<T>; name: FieldPath<T> }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <CategoryPicker {...props} value={String(field.value ?? "")} onChange={field.onChange} error={fieldState.error?.message} />
      )}
    />
  );
}
