'use client';

// Money is typed in major units with thousands separators and stays a plain
// decimal string. It is never parsed into a JavaScript number; the API converts
// it to minor units using the currency's metadata.

import React from 'react';
import { AppInput, type AppInputProps } from './app-input';
import { moneyInputPattern } from '@/lib/money';

export interface MoneyInputProps extends Omit<AppInputProps, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  /** Plain decimal string, e.g. "2500.50" ("" when empty). */
  value: string;
  onValueChange: (value: string) => void;
  currency?: string;
  /** Decimal places the currency allows (NGN 2, JPY 0, KWD 3). */
  exponent?: number;
}

export function MoneyInput({ value, onValueChange, currency = 'NGN', exponent = 2, startContent, ...props }: MoneyInputProps) {
  return (
    <AppInput
      {...props}
      type="number"
      numberPattern={moneyInputPattern(exponent)}
      startContent={startContent ?? <span className="text-[13px] font-medium text-muted">{currency}</span>}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}
