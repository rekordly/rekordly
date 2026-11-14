'use client';


// Built on HeroUI v3 <TextField>, <Input>, <InputGroup>, <Label>, <FieldError>, and <Description>.
// Features:
// - Completely optional label (renders nothing if omitted)
// - Native single asterisk indicator for isRequired (no double asterisks)
// - Proper flex-based prefix/suffix alignment without overlapping text
// - Auto password visibility toggle (Eye / EyeSlash) when type="password"
// - Integrates with React Hook Form / Zod error messages and field states
// - type="number": shows thousands separators (100,000) while typing; the
//   value passed to onChange is always plain digit text ("100000"), never a JS number
// - Built strictly on Rekordly semantic tokens (bg-field, border-field, text-foreground, etc.)

import React, { cloneElement, forwardRef, isValidElement, useState, type ReactNode } from 'react';
import {
  TextField,
  Label,
  Input,
  InputGroup,
  FieldError,
  Description,
} from '@heroui/react';
import { Eye, EyeSlash } from '@phosphor-icons/react';

export interface AppInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Optional form field label */
  label?: string;
  /** Helper description below the input */
  description?: string;
  /** Error message to display (triggers isInvalid state) */
  errorMessage?: string;
  /** Explicit error/invalid state */
  isInvalid?: boolean;
  /** Marks field as required */
  isRequired?: boolean;
  /** Disables user input */
  isDisabled?: boolean;
  /** Prefix content / icon */
  startContent?: ReactNode;
  /** Suffix content / action */
  endContent?: ReactNode;
  /** Container wrapper class name */
  containerClassName?: string;
  /** Sizing tier */
  size?: 'sm' | 'md' | 'lg';
  /** type="number": restricts what can be typed (plain text, without separators). */
  numberPattern?: RegExp;
}

const ICON_SIZE = { sm: 16, md: 18, lg: 20 } as const;
const GROUP_HEIGHT = { sm: 'h-9 text-[13px]', md: 'h-11 text-[14px]', lg: 'h-12 text-[15px]' } as const;

/** "1234567.5" → "1,234,567.5" (display only). */
export function groupDigits(raw: string): string {
  const negative = raw.startsWith('-');
  const [int = '', fraction] = raw.replace(/[^\d.]/g, '').split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction !== undefined ? `.${fraction}` : ''}`;
}

/** "1,234.5" → "1234.5" */
export const ungroupDigits = (shown: string): string => shown.replace(/,/g, '');

function resolveIcon(content: ReactNode, size: number): ReactNode {
  if (!content || !isValidElement(content) || typeof content.type === 'string') return content ?? null;
  const props = content.props as { size?: number; weight?: string; className?: string };
  return cloneElement(content, {
    size: props.size ?? size,
    weight: props.weight ?? 'duotone',
    className: props.className ?? 'text-muted shrink-0',
    'aria-hidden': true,
  } as Record<string, unknown>);
}

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(function AppInput(
  {
    label,
    description,
    errorMessage,
    isInvalid,
    isRequired,
    isDisabled,
    startContent,
    endContent,
    containerClassName,
    className,
    size = 'md',
    numberPattern = /^-?\d*\.?\d*$/,
    id,
    name,
    placeholder,
    type = 'text',
    value,
    defaultValue,
    onChange,
    ...props
  },
  ref,
) {
  const [showPassword, setShowPassword] = useState(false);
  // Numbers are typed as text so they can show separators; the caller only
  // ever sees the plain number text.
  // Only controlled fields (value passed in) are formatted; fields the form
  // fills through the ref keep the browser's own number input.
  const isNumeric = type === 'number' && value !== undefined;
  const external = value !== undefined && value !== null ? String(value) : undefined;
  const [numberText, setNumberText] = useState(() =>
    groupDigits(external ?? (defaultValue !== undefined ? String(defaultValue) : '')),
  );
  const [syncedFrom, setSyncedFrom] = useState(external);
  if (isNumeric && external !== syncedFrom) {
    // The value changed from outside (reset, load for Edit): show it, unless it
    // is exactly what the person just typed. Compared as text so money is never
    // parsed into a floating-point number.
    setSyncedFrom(external);
    if ((external ?? '') !== ungroupDigits(numberText)) {
      setNumberText(groupDigits(external ?? ''));
    }
  }
  const invalid = Boolean(errorMessage) || isInvalid;
  const isPassword = type === 'password';
  const computedType = isPassword ? (showPassword ? 'text' : 'password') : isNumeric ? 'text' : type;
  const numericProps = isNumeric ? { inputMode: 'decimal' as const } : {};
  const iconSize = ICON_SIZE[size];
  const heightClass = GROUP_HEIGHT[size];

  // Auto-provide password toggle suffix if type="password" and no custom endContent passed
  const effectiveEndContent =
    endContent !== undefined ? (
      endContent
    ) : isPassword ? (
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        aria-pressed={showPassword}
        className="text-muted hover:text-foreground transition-colors cursor-pointer p-1 rounded-lg focus:outline-hidden"
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? (
          <EyeSlash size={iconSize} weight="duotone" className="shrink-0" />
        ) : (
          <Eye size={iconSize} weight="duotone" className="shrink-0" />
        )}
      </button>
    ) : null;

  const hasGroup = Boolean(startContent || effectiveEndContent);

  return (
    <TextField
      isInvalid={invalid}
      isRequired={isRequired}
      isDisabled={isDisabled}
      name={name}
      value={isNumeric ? numberText : value !== undefined ? String(value) : undefined}
      defaultValue={!isNumeric && defaultValue !== undefined ? String(defaultValue) : undefined}
      onChange={(typed: string) => {
        let val = typed;
        if (isNumeric) {
          val = ungroupDigits(typed);
          if (!numberPattern.test(val)) return; // ignore anything else
          setNumberText(groupDigits(val));
        }
        if (onChange) {
          onChange({
            target: { value: val, name: name ?? '' },
            currentTarget: { value: val, name: name ?? '' },
          } as unknown as React.ChangeEvent<HTMLInputElement>);
        }
      }}
      aria-label={!label ? (props['aria-label'] || placeholder || 'Input field') : undefined}
      className={`gap-1.5 w-full ${containerClassName ?? ''}`.trim()}
    >
      {/* Optional Label - HeroUI automatically appends the required indicator when isRequired={true} */}
      {label && (
        <Label className="text-[13px] font-medium text-foreground select-none">
          {label}
        </Label>
      )}

      {/* Input Field: Uses InputGroup when prefix or suffix icons exist to eliminate text overlap */}
      {hasGroup ? (
        <InputGroup
          data-invalid={invalid || undefined}
          data-disabled={isDisabled || undefined}
          className={`field-shell w-full shadow-none ${heightClass}`}
        >
          {startContent && (
            <InputGroup.Prefix className="border-none bg-transparent pl-3.5 pr-2 flex items-center text-muted shrink-0 shadow-none">
              {resolveIcon(startContent, iconSize)}
            </InputGroup.Prefix>
          )}

          <InputGroup.Input
            {...props}
            {...numericProps}
            ref={ref}
            id={id}
            name={name}
            type={computedType}
            placeholder={placeholder}
            disabled={isDisabled}
            required={isRequired}
            className={`flex-1 min-w-0 bg-transparent border-0 outline-none text-foreground placeholder:text-field-placeholder px-2 py-0 shadow-none ${
              !startContent ? 'pl-3.5' : ''
            } ${!effectiveEndContent ? 'pr-3.5' : ''} ${className ?? ''}`}
          />

          {effectiveEndContent && (
            <InputGroup.Suffix className="border-none bg-transparent pr-3.5 pl-2 flex items-center text-muted shrink-0 shadow-none">
              {resolveIcon(effectiveEndContent, iconSize)}
            </InputGroup.Suffix>
          )}
        </InputGroup>
      ) : (
        <Input
          {...props}
          {...numericProps}
          ref={ref}
          id={id}
          name={name}
          type={computedType}
          placeholder={placeholder}
          disabled={isDisabled}
          required={isRequired}
          data-invalid={invalid || undefined}
          data-disabled={isDisabled || undefined}
          className={`field-shell w-full px-3.5 placeholder:text-field-placeholder shadow-none ${heightClass} ${className ?? ''}`}
        />
      )}

      {/* Helper description */}
      {description && !invalid && (
        <Description className="text-[12px] text-muted">{description}</Description>
      )}

      {/* Validation error message */}
      {errorMessage && (
        <FieldError className="animate-fade-up text-[12px] font-medium text-danger">
          {errorMessage}
        </FieldError>
      )}
    </TextField>
  );
});
