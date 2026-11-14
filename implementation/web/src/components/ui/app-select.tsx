'use client';


// Standardized reusable Select component built on HeroUI Select compound components.
import React from 'react';
import { Select, Label, ListBox } from '@heroui/react';

export interface AppSelectOption {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface AppSelectProps {
  label?: string;
  placeholder?: string;
  options: AppSelectOption[];
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectionChange?: (key: string) => void;
  className?: string;
  triggerClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  isDisabled?: boolean;
  isRequired?: boolean;
  error?: string;
  description?: string;
  name?: string;
  id?: string;
  'aria-label'?: string;
}

export function AppSelect({
  label,
  placeholder = 'Select option...',
  options,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  className = '',
  triggerClassName = '',
  size = 'md',
  isDisabled,
  isRequired,
  error,
  description,
  name,
  id,
  'aria-label': ariaLabel,
}: AppSelectProps) {
  const heightClass =
    size === 'sm'
      ? 'h-8 text-[12px] py-1 px-2.5'
      : size === 'lg'
        ? 'h-12 text-[15px] px-4'
        : 'h-11 text-[14px] px-3.5';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <Label className="text-[13px] font-medium text-foreground">{label}</Label>}
      <Select
        selectedKey={selectedKey !== undefined ? selectedKey : undefined}
        defaultSelectedKey={defaultSelectedKey !== undefined ? defaultSelectedKey : undefined}
        onSelectionChange={(key) => {
          if (key !== null && key !== undefined && onSelectionChange) {
            onSelectionChange(String(key));
          }
        }}
        placeholder={placeholder}
        isDisabled={isDisabled}
        isRequired={isRequired}
        aria-label={ariaLabel || label || placeholder}
        name={name}
        id={id}
        className="w-full"
      >
        <Select.Trigger
          data-invalid={error ? true : undefined}
          className={`field-shell flex w-full cursor-pointer items-center justify-between gap-2 shadow-none ${heightClass} ${triggerClassName}`}
        >
          {/* The field shows only the chosen label; descriptions stay in the list. */}
          <Select.Value className="truncate text-foreground data-[placeholder]:text-field-placeholder">
            {({ selectedText, isPlaceholder }: { selectedText?: string | null; isPlaceholder?: boolean }) => (isPlaceholder ? placeholder : selectedText)}
          </Select.Value>
          <Select.Indicator className="text-muted shrink-0" />
        </Select.Trigger>
        <Select.Popover className="animate-fade-up z-50 max-h-72 w-(--trigger-width) min-w-20 overflow-y-auto rounded-2xl border border-border bg-overlay p-1 shadow-xl">
          <ListBox className="outline-none space-y-0.5">
            {options.map((opt) => (
              <ListBox.Item
                key={opt.key}
                id={opt.key}
                textValue={opt.label}
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-surface-secondary focus:bg-surface-secondary data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-foreground"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {opt.icon}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.description && (
                      <span className="truncate text-[11px] text-muted">{opt.description}</span>
                    )}
                  </div>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {error && <p className="animate-fade-up text-[12px] font-medium text-danger">{error}</p>}
      {description && !error && <p className="text-[12px] text-muted">{description}</p>}
    </div>
  );
}
