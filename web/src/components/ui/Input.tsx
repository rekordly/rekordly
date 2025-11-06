'use client';

import React from 'react';
import { Controller, Control, FieldValues, Path } from 'react-hook-form';
import {
  Input,
  Autocomplete,
  AutocompleteItem,
  Select,
  SelectItem,
} from '@heroui/react';

interface BaseInputProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label: string;
  placeholder?: string;
  description?: string;
  isRequired?: boolean;
}

interface TextInputProps<T extends FieldValues> extends BaseInputProps<T> {
  type?: 'text' | 'email' | 'tel' | 'url' | 'date' | 'datetime-local' | 'time';
  startContent?: React.ReactNode;
  endContent?: React.ReactNode;
  isDisabled?: boolean;
}

export function TextInput<T extends FieldValues>({
  name,
  control,
  label,
  placeholder,
  description,
  type = 'text',
  startContent,
  endContent,
  isRequired = false,
  isDisabled = false,
}: TextInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => {
        const { value, onChange, ...restField } = field;

        let formattedValue: string | undefined;

        const rawValue = value as unknown;

        if (rawValue instanceof Date) {
          if (type === 'date') {
            formattedValue = rawValue.toISOString().split('T')[0];
          } else if (type === 'datetime-local') {
            formattedValue = rawValue.toISOString().slice(0, 16);
          }
        } else if (typeof value === 'string') {
          formattedValue = value;
        }

        return (
          <Input
            {...restField}
            classNames={{
              inputWrapper: 'border-1 h-14 border-default-300 rounded-2xl',
              label: 'font-light text-default-400',
            }}
            color="primary"
            description={description}
            endContent={endContent}
            errorMessage={error?.message}
            isDisabled={isDisabled}
            isInvalid={!!error}
            isRequired={isRequired}
            label={label}
            placeholder={placeholder}
            startContent={startContent}
            type={type}
            value={formattedValue ?? ''}
            variant="bordered"
            onChange={e => {
              const val = e.target.value;

              if (type === 'date' && val) {
                onChange(new Date(val));
              } else if (type === 'datetime-local' && val) {
                onChange(new Date(val));
              } else {
                onChange(val);
              }
            }}
          />
        );
      }}
    />
  );
}

// ✅ Number input
export function NumberInput<T extends FieldValues>({
  name,
  control,
  label,
  placeholder,
  description,
  min,
  max,
  step = 1,
  startContent,
  endContent,
  isRequired = false,
}: TextInputProps<T> & { min?: number; max?: number; step?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Input
          {...field}
          classNames={{
            inputWrapper: 'border-1 h-14 border-default-300 rounded-2xl',
            label: 'font-light text-default-400',
          }}
          color="primary"
          description={description}
          endContent={endContent}
          errorMessage={error?.message}
          isInvalid={!!error}
          isRequired={isRequired}
          label={label}
          max={max}
          min={min}
          placeholder={placeholder}
          startContent={startContent}
          step={step}
          type="number"
          variant="bordered"
          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
        />
      )}
    />
  );
}

// ✅ Simplified Autocomplete input - just handles display and selection
interface AutocompleteInputProps<T extends FieldValues, I = any>
  extends BaseInputProps<T> {
  items: I[];
  getOptionLabel?: (item: I) => string;
  getOptionValue?: (item: I) => string;
  onSelectionChange?: (value: string) => void;
  onInputChange?: (value: string) => void;
  isDisabled?: boolean;
  disallowTyping?: boolean;
}

export function AutocompleteInput<T extends FieldValues, I = any>({
  name,
  control,
  label,
  placeholder,
  description,
  items,
  getOptionLabel,
  getOptionValue,
  onSelectionChange,
  onInputChange,
  isRequired = false,
  isDisabled = false,
  disallowTyping = false,
}: AutocompleteInputProps<T, I>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Autocomplete
          allowsCustomValue={!disallowTyping}
          classNames={{
            base: 'border-1 border-default-300 rounded-2xl',
          }}
          color="primary"
          description={description}
          errorMessage={error?.message}
          isDisabled={isDisabled}
          isInvalid={!!error}
          isRequired={isRequired}
          label={label}
          placeholder={placeholder}
          selectedKey={field.value || null}
          variant="bordered"
          onInputChange={value => {
            // If typing is disallowed and value changes, ignore it
            if (disallowTyping && value && field.value) {
              return;
            }
            if (onInputChange) {
              onInputChange(value);
            }
          }}
          onSelectionChange={key => {
            const stringKey = key as string;

            field.onChange(stringKey || '');
            if (onSelectionChange && stringKey) {
              onSelectionChange(stringKey);
            }
          }}
        >
          {items.map(item => {
            const value = getOptionValue
              ? getOptionValue(item)
              : (item as any).id;
            const labelText = getOptionLabel
              ? getOptionLabel(item)
              : (item as any).name;

            return (
              <AutocompleteItem key={value} textValue={labelText}>
                {labelText}
              </AutocompleteItem>
            );
          })}
        </Autocomplete>
      )}
    />
  );
}

// ✅ Dropdown input
export function DropdownInput<T extends FieldValues>({
  name,
  control,
  label,
  placeholder,
  description,
  items,
  isRequired = false,
}: BaseInputProps<T> & { items: { value: string; label: string }[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Select
          {...field}
          classNames={{
            trigger: 'border-1 h-14 border-default-300 rounded-2xl',
            label: 'font-light text-default-400',
          }}
          color="primary"
          description={description}
          errorMessage={error?.message}
          isInvalid={!!error}
          isRequired={isRequired}
          label={label}
          placeholder={placeholder}
          selectedKeys={field.value ? [field.value] : []}
          variant="bordered"
          onSelectionChange={keys => {
            const value = Array.from(keys)[0] as string;

            field.onChange(value);
          }}
        >
          {items.map(item => (
            <SelectItem key={item.value}>{item.label}</SelectItem>
          ))}
        </Select>
      )}
    />
  );
}
