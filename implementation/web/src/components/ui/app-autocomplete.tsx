'use client';

import React from 'react';
import { Autocomplete, Label, ListBox, SearchField } from '@heroui/react';
import { CaretDown, MagnifyingGlass, X } from '@phosphor-icons/react';

export interface AppAutocompleteOption {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface AppAutocompleteProps {
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  options: AppAutocompleteOption[];
  selectedKey?: string | null;
  defaultSelectedKey?: string;
  onSelectionChange?: (key: string | null) => void;
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

export function AppAutocomplete({
  label,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
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
}: AppAutocompleteProps) {
  const heightClass =
    size === 'sm'
      ? 'h-8 text-xs py-1 px-2.5'
      : size === 'lg'
        ? 'h-12 text-sm px-4'
        : 'h-10 text-xs px-3';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <Label className="text-[13px] font-medium text-foreground">{label}</Label>}
      <Autocomplete
        selectedKey={selectedKey !== undefined ? (selectedKey ?? undefined) : undefined}
        defaultSelectedKey={defaultSelectedKey}
        onSelectionChange={(key) => {
          if (onSelectionChange) {
            onSelectionChange(key !== null && key !== undefined ? String(key) : null);
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
        <Autocomplete.Trigger
          className={`flex w-full items-center justify-between gap-2 rounded-xl border border-field-border bg-field text-foreground outline-none transition-colors hover:border-field-border-hover focus:border-accent cursor-pointer shadow-none ${heightClass} ${triggerClassName}`}
        >
          <Autocomplete.Value className="text-xs truncate font-medium text-foreground" />
          <div className="flex items-center gap-1 text-muted shrink-0">
            <Autocomplete.ClearButton className="p-0.5 hover:text-foreground cursor-pointer rounded-full transition-colors">
              <X size={12} weight="bold" />
            </Autocomplete.ClearButton>
            <Autocomplete.Indicator>
              <CaretDown size={14} weight="bold" />
            </Autocomplete.Indicator>
          </div>
        </Autocomplete.Trigger>

        <Autocomplete.Popover className="w-(--trigger-width) min-w-48 max-h-72 overflow-y-auto rounded-2xl border border-border bg-overlay p-2 shadow-2xl backdrop-blur-xl z-50">
          <Autocomplete.Filter>
            <div className="mb-2">
              <SearchField
                aria-label={searchPlaceholder}
                className="flex items-center gap-1.5 rounded-lg border border-field-border bg-field/80 px-2.5 py-1 text-xs text-foreground outline-none focus-within:border-accent w-full"
              >
                <MagnifyingGlass size={13} weight="bold" className="text-muted shrink-0" />
                <SearchField.Input
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-xs font-medium text-foreground placeholder:text-muted outline-none border-none shadow-none focus:ring-0"
                />
                <SearchField.ClearButton className="text-muted hover:text-foreground cursor-pointer">
                  <X size={11} weight="bold" />
                </SearchField.ClearButton>
              </SearchField>
            </div>
          </Autocomplete.Filter>

          <ListBox className="outline-none space-y-0.5">
            {options.map((opt) => (
              <ListBox.Item
                key={opt.key}
                id={opt.key}
                textValue={opt.label}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-foreground cursor-pointer transition-colors hover:bg-surface focus:bg-surface outline-none"
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
        </Autocomplete.Popover>
      </Autocomplete>
      {error && <p className="text-[11px] font-medium text-danger">{error}</p>}
      {description && !error && <p className="text-[11px] text-muted">{description}</p>}
    </div>
  );
}
