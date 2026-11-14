"use client";

// How a product is counted: piece, kilogram, hour, and so on. A select, never free text,
// so units stay consistent across products, invoices and stock.
//
//   <UnitPicker value={unit} onChange={setUnit} kind="service" />

import { AppSelect } from "@/components/ui/app-select";
import type { ProductKind } from "@/types/products";

export interface UnitOption {
  key: string;
  label: string;
  group: "count" | "weight" | "volume" | "length" | "time";
}

export const UNITS: UnitOption[] = [
  { key: "pc", label: "Piece (pc)", group: "count" },
  { key: "each", label: "Each", group: "count" },
  { key: "pack", label: "Pack", group: "count" },
  { key: "box", label: "Box", group: "count" },
  { key: "carton", label: "Carton", group: "count" },
  { key: "dozen", label: "Dozen", group: "count" },
  { key: "pair", label: "Pair", group: "count" },
  { key: "set", label: "Set", group: "count" },
  { key: "bag", label: "Bag", group: "count" },
  { key: "bottle", label: "Bottle", group: "count" },
  { key: "can", label: "Can", group: "count" },
  { key: "sachet", label: "Sachet", group: "count" },
  { key: "roll", label: "Roll", group: "count" },
  { key: "kg", label: "Kilogram (kg)", group: "weight" },
  { key: "g", label: "Gram (g)", group: "weight" },
  { key: "l", label: "Litre (l)", group: "volume" },
  { key: "ml", label: "Millilitre (ml)", group: "volume" },
  { key: "m", label: "Metre (m)", group: "length" },
  { key: "cm", label: "Centimetre (cm)", group: "length" },
  { key: "yard", label: "Yard", group: "length" },
  { key: "hour", label: "Hour", group: "time" },
  { key: "day", label: "Day", group: "time" },
  { key: "week", label: "Week", group: "time" },
  { key: "month", label: "Month", group: "time" },
  { key: "session", label: "Session", group: "time" },
  { key: "job", label: "Job", group: "time" },
];

export function unitLabel(key: string): string {
  return UNITS.find((unit) => unit.key === key)?.label ?? key;
}

export function UnitPicker({
  value,
  onChange,
  kind,
  label = "Unit",
  error,
}: {
  value: string;
  onChange: (unit: string) => void;
  /** Services list time units first; products list count units first. */
  kind?: ProductKind;
  label?: string;
  error?: string;
}) {
  const ordered = kind === "service" ? [...UNITS.filter((unit) => unit.group === "time"), ...UNITS.filter((unit) => unit.group !== "time")] : UNITS;
  // Keep an older custom unit selectable so editing never silently drops it.
  const options = ordered.some((unit) => unit.key === value) || !value ? ordered : [{ key: value, label: value, group: "count" as const }, ...ordered];
  return (
    <AppSelect
      label={label}
      placeholder="Choose a unit"
      options={options.map((unit) => ({ key: unit.key, label: unit.label }))}
      selectedKey={value || undefined}
      onSelectionChange={onChange}
      error={error}
    />
  );
}
