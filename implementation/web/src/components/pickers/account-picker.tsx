"use client";

// Choose a money account (cash, bank, POS, wallet), the same way on every screen.
// Each option shows its type and current balance so people pick the right one.
//
//   <AccountPicker workspaceId value={id} onChange={setId} label="Paid into" />
//   <AccountField control={form.control} name="account_id" workspaceId label="Paid into" />   (react-hook-form)

import { Bank, CreditCard, DeviceMobile, Money, Wallet } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { AppSelect } from "@/components/ui/app-select";
import { formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";
import type { MoneyAccount } from "@/types/finance";

const TYPE_ICON: Record<string, ReactNode> = {
  cash: <Money size={16} className="text-muted" aria-hidden="true" />,
  bank: <Bank size={16} className="text-muted" aria-hidden="true" />,
  pos: <CreditCard size={16} className="text-muted" aria-hidden="true" />,
  mobile_money: <DeviceMobile size={16} className="text-muted" aria-hidden="true" />,
};

function humanise(value: string) {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function useMoneyAccounts(workspaceId: number) {
  return useQuery({
    queryKey: moneyKeys.accounts(workspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId }),
  });
}

export function accountOptions(accounts: MoneyAccount[] | undefined, currency?: string) {
  return (accounts ?? [])
    .filter((account) => account.is_active && (!currency || account.currency === currency))
    .map((account) => ({
      key: String(account.id),
      label: account.name,
      description: `${humanise(account.account_type)} · ${formatMinorAmount(account.current_balance_minor, account.currency, account.currency_exponent)}`,
      icon: TYPE_ICON[account.account_type] ?? <Wallet size={16} className="text-muted" aria-hidden="true" />,
    }));
}

export interface AccountPickerProps {
  workspaceId: number;
  value: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  isRequired?: boolean;
  /** Only show accounts in this currency. */
  currency?: string;
  description?: string;
}

export function AccountPicker({ workspaceId, value, onChange, label = "Account", placeholder, error, isRequired, currency, description }: AccountPickerProps) {
  const accounts = useMoneyAccounts(workspaceId);
  const options = accountOptions(accounts.data, currency);
  return (
    <AppSelect
      label={label}
      placeholder={accounts.isPending ? "Loading accounts…" : options.length ? (placeholder ?? "Choose an account") : "No accounts yet. Add one in Accounts."}
      options={options}
      selectedKey={value || undefined}
      onSelectionChange={onChange}
      error={error}
      isRequired={isRequired}
      description={description}
    />
  );
}

/** react-hook-form version: the form value is the account id as a string. */
export function AccountField<T extends FieldValues>({
  control,
  name,
  ...props
}: Omit<AccountPickerProps, "value" | "onChange" | "error"> & { control: Control<T>; name: FieldPath<T> }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AccountPicker {...props} value={String(field.value ?? "")} onChange={field.onChange} error={fieldState.error?.message} />
      )}
    />
  );
}
