"use client";

// Rows for lists inside drawers, matching the customer picker (PickerDrawer):
// a dashed "+ Add …" row with a green tile, and item rows with a small tile,
// a title, a short line under it and optional trailing actions.
//
//   <ListAddRow label="Add question" onPress={add} />
//   <ListItemRow tile="Q" title="Do you deliver?" description="Yes, across Lagos" onPress={edit}
//     trailing={<ListRowIconButton label="Remove" icon={<Trash />} tone="danger" onPress={remove} />} />

import { Plus } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function ListAddRow({ label, onPress, isDisabled }: { label: string; onPress: () => void; isDisabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isDisabled}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-2.5 text-left text-[14px] font-semibold text-primary-soft-foreground transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-white">
        <Plus size={16} weight="bold" aria-hidden="true" />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

const initials = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase() || "•";

export function ListItemRow({
  title,
  description,
  tile,
  onPress,
  trailing,
}: {
  title: string;
  description?: ReactNode;
  /** Icon or short text for the tile. Defaults to the title's initials. */
  tile?: ReactNode;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-[13px] font-bold text-foreground">{tile ?? initials(title)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{title}</span>
        {description ? <span className="block truncate text-[12px] text-muted">{description}</span> : null}
      </span>
    </>
  );
  return (
    <li className="animate-fade-up flex items-center gap-1">
      {onPress ? (
        <button type="button" onClick={onPress} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-secondary">
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5">{body}</span>
      )}
      {trailing}
    </li>
  );
}

export function ListRowIconButton({ label, icon, onPress, tone = "default" }: { label: string; icon: ReactNode; onPress: () => void; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors ${tone === "danger" ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-surface-secondary hover:text-foreground"}`}
    >
      {icon}
    </button>
  );
}
