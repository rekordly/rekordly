"use client";

// The one switch used across Rekordly, built on HeroUI's Switch.
//
//   <AppSwitch isSelected={on} onChange={setOn} label="Sell this" />
//   <AppSwitch isSelected={on} onChange={setOn} aria-label="Sell Red / XL" />   // no visible label

import { Label, Switch } from "@heroui/react";

export function AppSwitch({
  isSelected,
  onChange,
  label,
  description,
  size = "sm",
  isDisabled,
  "aria-label": ariaLabel,
  className = "",
}: {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  label?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  isDisabled?: boolean;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} size={size} isDisabled={isDisabled} className={className}>
      <Switch.Content aria-label={label ? undefined : ariaLabel} className="flex cursor-pointer items-center gap-3">
        {label ? (
          <span className="min-w-0 flex-1">
            <Label className="block text-[14px] font-semibold">{label}</Label>
            {description ? <span className="block text-[12px] text-muted">{description}</span> : null}
          </span>
        ) : null}
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
