'use client';

import React from 'react';
import { ComboBox, Input, Label, ListBox } from '@heroui/react';
import { CaretDown, Plus } from '@phosphor-icons/react';

export interface AppComboBoxOption {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface AppComboBoxProps {
  label?: string;
  placeholder?: string;
  options: AppComboBoxOption[];
  selectedKey?: string | null;
  defaultSelectedKey?: string;
  inputValue?: string;
  defaultInputValue?: string;
  onSelectionChange?: (key: string | null) => void;
  onInputChange?: (value: string) => void;
  allowsCustomValue?: boolean;
  onCustomValueSubmit?: (value: string) => void;
  className?: string;
  inputClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  isDisabled?: boolean;
  isRequired?: boolean;
  error?: string;
  description?: string;
  name?: string;
  id?: string;
  'aria-label'?: string;
}

export function AppComboBox({
  label,
  placeholder = 'Type or select...',
  options,
  selectedKey,
  defaultSelectedKey,
  inputValue,
  defaultInputValue,
  onSelectionChange,
  onInputChange,
  allowsCustomValue = true,
  onCustomValueSubmit,
  className = '',
  inputClassName = '',
  size = 'md',
  isDisabled,
  isRequired,
  error,
  description,
  name,
  id,
  'aria-label': ariaLabel,
}: AppComboBoxProps) {
  const heightClass =
    size === 'sm'
      ? 'h-8 text-[12px] py-1 px-2.5'
      : size === 'lg'
        ? 'h-12 text-[15px] px-4'
        : 'h-11 text-[14px] px-3.5';

  // Check if current text exists in options
  const currentText = inputValue?.trim().toLowerCase() || '';
  const hasExactMatch = options.some(
    (opt) => opt.label.trim().toLowerCase() === currentText || opt.key.trim().toLowerCase() === currentText,
  );
  const showCustomOption = allowsCustomValue && currentText.length > 0 && !hasExactMatch;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <Label className="text-[13px] font-medium text-foreground">{label}</Label>}
      <ComboBox
        selectedKey={selectedKey !== undefined ? (selectedKey ?? undefined) : undefined}
        defaultSelectedKey={defaultSelectedKey}
        inputValue={inputValue}
        defaultInputValue={defaultInputValue}
        onSelectionChange={(key) => {
          if (onSelectionChange) {
            onSelectionChange(key !== null && key !== undefined ? String(key) : null);
          }
        }}
        onInputChange={(val) => {
          if (onInputChange) {
            onInputChange(val);
          }
        }}
        allowsCustomValue={allowsCustomValue}
        isDisabled={isDisabled}
        isRequired={isRequired}
        aria-label={ariaLabel || label || placeholder}
        name={name}
        id={id}
        className="w-full"
      >
        <ComboBox.InputGroup
          data-invalid={error ? true : undefined}
          className={`field-shell flex w-full items-center justify-between gap-2 ${heightClass} ${inputClassName}`}
        >
          <Input
            placeholder={placeholder}
            className="w-full border-none bg-transparent text-foreground shadow-none outline-none placeholder:text-field-placeholder focus:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && showCustomOption && onCustomValueSubmit && inputValue) {
                e.preventDefault();
                onCustomValueSubmit(inputValue.trim());
              }
            }}
          />
          <ComboBox.Trigger className="text-muted hover:text-foreground shrink-0 cursor-pointer p-1">
            <CaretDown size={14} weight="bold" />
          </ComboBox.Trigger>
        </ComboBox.InputGroup>

        <ComboBox.Popover className="animate-fade-up z-50 max-h-72 w-(--trigger-width) min-w-48 overflow-y-auto rounded-2xl border border-border bg-overlay p-1 shadow-xl">
          <ListBox className="outline-none space-y-0.5">
            {showCustomOption && (
              <ListBox.Item
                key="__custom_entry__"
                id="__custom_entry__"
                textValue={inputValue}
                onAction={() => {
                  if (onCustomValueSubmit && inputValue) {
                    onCustomValueSubmit(inputValue.trim());
                  }
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-primary hover:bg-primary/10 focus:bg-primary/10 cursor-pointer transition-colors outline-none border-b border-border/50 mb-1"
              >
                <Plus size={14} weight="bold" className="shrink-0 text-primary" />
                <span className="truncate">Add &quot;{inputValue}&quot; as new</span>
              </ListBox.Item>
            )}
            {options.map((opt) => (
              <ListBox.Item
                key={opt.key}
                id={opt.key}
                textValue={opt.label}
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-surface-secondary focus:bg-surface-secondary"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {opt.icon}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.description && (
                      <span className="text-[10px] text-muted truncate">{opt.description}</span>
                    )}
                  </div>
                </div>
              </ListBox.Item>
            ))}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>
      {error && <p className="animate-fade-up text-[12px] font-medium text-danger">{error}</p>}
      {description && !error && <p className="text-[12px] text-muted">{description}</p>}
    </div>
  );
}
