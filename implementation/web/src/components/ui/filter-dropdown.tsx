"use client";

// A filter in the same pill style as the "Actions" menu. The trigger shows only the
// chosen label; the menu can show a short description under each option.
//
//   <FilterDropdown label="Status" options={[{ key: "all", label: "All" }, …]} value={status} onChange={setStatus} />

import { Dropdown } from "@heroui/react";
import { CaretDown, Check } from "@phosphor-icons/react";

export interface FilterOption<T extends string> {
  key: T;
  label: string;
  description?: string;
}

export function FilterDropdown<T extends string>({
  label,
  options,
  value,
  onChange,
  placement = "bottom start",
}: {
  /** Shown before the chosen value, e.g. "Status". */
  label: string;
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  placement?: "bottom start" | "bottom end";
}) {
  const chosen = options.find((option) => option.key === value) ?? options[0];
  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={`${label}: ${chosen?.label ?? ""}`}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors hover:bg-surface-secondary"
      >
        <span className="text-muted">{label}:</span>
        <span>{chosen?.label}</span>
        <CaretDown size={13} className="text-muted" aria-hidden="true" />
      </Dropdown.Trigger>
      <Dropdown.Popover placement={placement} className="min-w-[200px] rounded-xl bg-overlay p-1">
        <Dropdown.Menu aria-label={label} onAction={(key) => onChange(String(key) as T)}>
          {options.map((option) => (
            <Dropdown.Item key={option.key} id={option.key} textValue={option.label} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="block font-medium">{option.label}</span>
                {option.description ? <span className="block text-[11px] text-muted">{option.description}</span> : null}
              </span>
              {option.key === value ? <Check size={14} weight="bold" className="shrink-0 text-primary" aria-hidden="true" /> : null}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
