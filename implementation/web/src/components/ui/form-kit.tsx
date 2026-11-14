"use client";

// The form kit. Pieces that give every form the same calm hierarchy:
// - FormPage: full-page layout for large records, with a summary column and a sticky action bar.
// - FormSection: a numbered card with a title and one line of help.
// - ChoiceCards: big tappable options (e.g. Paid / Not paid).
// - EntityChip: a chosen customer/supplier/product shown compactly with "Change".
// - PickerDrawer: search-first picker with an inline "Add new" that never leaves the form.
// - SummaryPanel: live totals.
// - SuccessPanel: what happened, and the next sensible step.

import { Drawer } from "@heroui/react";
import { ArrowLeft, CaretDown, Check, MagnifyingGlass, Plus, X, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

export function FormPage({
  title,
  description,
  back,
  aside,
  actions,
  children,
}: {
  title: string;
  description?: string;
  back?: { href: string; label: string };
  /** Right column on desktop (summary); stacks above the action bar on phones. */
  aside?: ReactNode;
  /** The sticky action bar contents, usually Cancel / Save draft / Save. */
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="animate-fade-up mx-auto w-full max-w-[1120px]">
      <div className="pt-2">
        {back ? (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground">
            <ArrowLeft size={14} weight="bold" aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
        {description ? <p className="mt-1 text-[14px] text-muted">{description}</p> : null}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="space-y-4">{children}</div>
        {aside ? <aside className="space-y-4 xl:sticky xl:top-6">{aside}</aside> : null}
      </div>

      {/* Sticks to the bottom of the scrolling page, so it never covers the sidebar. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-6 -mb-10 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex w-full items-center justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function FormSection({
  step,
  title,
  description,
  action,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  step?: number;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Optional sections can start closed to keep the form short. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = !collapsible || open;
  const heading = (
    <span className="flex min-w-0 items-start gap-3 text-left">
      {step !== undefined ? (
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-bold text-background tabular">{step}</span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{title}</span>
        {description ? <span className="mt-0.5 block text-[13px] text-muted">{description}</span> : null}
      </span>
    </span>
  );
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 p-5 pb-0">
        {collapsible ? (
          <button type="button" aria-expanded={expanded} onClick={() => setOpen(!open)} className="flex flex-1 cursor-pointer items-start justify-between gap-3">
            {heading}
            <CaretDown size={16} className={`mt-1 shrink-0 text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        ) : (
          heading
        )}
        {action}
      </div>
      {expanded ? <div className="animate-fade-up space-y-4 p-5">{children}</div> : <div className="h-5" />}
    </section>
  );
}

/** Two columns on wider screens, one on phones. */
export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Choices                                                                     */
/* -------------------------------------------------------------------------- */

export interface Choice<T extends string> {
  key: T;
  label: string;
  description?: string;
  icon?: PhosphorIcon;
}

export function ChoiceCards<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-1.5">
      {label ? <p className="text-[13px] font-medium">{label}</p> : null}
      <div className={`grid gap-2 ${options.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
        {options.map((option) => {
          const active = option.key === value;
          const OptionIcon = option.icon;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.key)}
              className={`relative flex cursor-pointer items-start gap-3 ${options.length > 2 ? "sm:flex-col sm:gap-2.5" : ""} rounded-xl border p-3.5 text-left transition-all duration-150 active:scale-[0.98] ${
                active ? "border-primary bg-primary-soft/60 ring-4 ring-primary/10" : "border-border bg-surface hover:border-field-border-hover"
              }`}
            >
              {OptionIcon ? (
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${active ? "bg-primary text-white" : "bg-surface-secondary text-muted"}`}>
                  <OptionIcon size={16} weight={active ? "fill" : "regular"} aria-hidden="true" />
                </span>
              ) : null}
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{option.label}</span>
                {option.description ? <span className="mt-0.5 block text-[12px] text-muted">{option.description}</span> : null}
              </span>
              {active ? (
                <span className="animate-pop absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-primary text-white">
                  <Check size={12} weight="bold" aria-hidden="true" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entity chip                                                                 */
/* -------------------------------------------------------------------------- */

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Shows what is selected, or a dashed prompt that opens the picker. */
export function EntityField({
  label,
  value,
  meta,
  placeholder,
  onOpen,
  onClear,
  error,
}: {
  label: string;
  value?: string;
  meta?: ReactNode;
  placeholder: string;
  onOpen: () => void;
  onClear?: () => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium">{label}</p>
      {value ? (
        <div className="animate-fade-up flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 pr-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-[13px] font-bold text-primary-soft-foreground">{initialsOf(value)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{value}</span>
            {meta ? <span className="block truncate text-[12px] text-muted">{meta}</span> : null}
          </span>
          <button type="button" onClick={onOpen} className="h-8 cursor-pointer rounded-lg px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-primary-soft">
            Change
          </button>
          {onClear ? (
            <button type="button" aria-label={`Remove ${label.toLowerCase()}`} onClick={onClear} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground">
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          data-invalid={error ? true : undefined}
          style={{ borderStyle: "dashed" }}
          className="field-shell flex h-14 w-full cursor-pointer items-center gap-3 px-3 text-left"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-surface-secondary text-muted">
            <Plus size={16} aria-hidden="true" />
          </span>
          <span className="text-[14px] text-field-placeholder">{placeholder}</span>
        </button>
      )}
      {error ? <p className="animate-fade-up text-[12px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Picker drawer                                                               */
/* -------------------------------------------------------------------------- */

export interface PickerItem {
  id: string;
  label: string;
  description?: string;
  /** Right-hand detail, e.g. "owes ₦12,000" or "8 in stock". */
  meta?: string;
}

const wideQuery = "(min-width: 640px)";
function subscribeWide(callback: () => void) {
  const list = window.matchMedia(wideQuery);
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
}

export function PickerDrawer({
  isOpen,
  onOpenChange,
  title,
  items,
  selectedId,
  onSelect,
  searchPlaceholder = "Search",
  emptyText = "Nothing here yet.",
  createLabel,
  renderCreate,
  isLoading,
  editOnSelect = false,
  startInForm,
  formTitle,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: PickerItem[];
  selectedId?: string;
  onSelect: (item: PickerItem) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Label for the inline create action, e.g. "New customer". */
  createLabel?: string;
  /** The inline form. With an item it edits or configures that item; without one it creates. Call done(item) to finish. */
  renderCreate?: (props: { initialName: string; item?: PickerItem; done: (item: PickerItem) => void; cancel: () => void }) => ReactNode;
  isLoading?: boolean;
  /** Choosing an item opens the form (e.g. to set quantity) instead of closing straight away. */
  editOnSelect?: boolean;
  /** Open directly in the form, for editing something already added. */
  startInForm?: { item?: PickerItem };
  /** Title for the form when it is configuring an existing item. */
  formTitle?: string;
}) {
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches, () => true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ item?: PickerItem } | null>(startInForm ?? null);
  const creating = form !== null;
  const setCreating = (open: boolean) => setForm(open ? {} : null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => `${item.label} ${item.description ?? ""}`.toLowerCase().includes(term));
  }, [items, search]);

  const close = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setSearch("");
      setCreating(false);
    }
  };

  const choose = (item: PickerItem) => {
    onSelect(item);
    close(false);
  };
  const pick = (item: PickerItem) => (editOnSelect && renderCreate ? setForm({ item }) : choose(item));

  return (
    <Drawer>
      <Drawer.Backdrop isOpen={isOpen} onOpenChange={close} variant="blur">
        <Drawer.Content placement={wide ? "right" : "bottom"}>
          <Drawer.Dialog
            className={`flex flex-col bg-overlay p-0 ${wide ? "animate-drawer-in h-full w-full max-w-[440px]" : "animate-sheet-up max-h-[88dvh] w-full rounded-t-3xl"}`}
          >
            {!wide ? <span aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-default" /> : null}
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5">
              <div className="flex items-center gap-2">
                {creating ? (
                  <button type="button" aria-label="Back to list" onClick={() => setCreating(false)} className="grid size-8 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-foreground">
                    <ArrowLeft size={16} aria-hidden="true" />
                  </button>
                ) : null}
                <Drawer.Heading className="text-[17px] font-bold tracking-[-0.02em]">{form?.item ? (formTitle ?? form.item.label) : creating && createLabel ? createLabel : title}</Drawer.Heading>
              </div>
              <button type="button" aria-label="Close" onClick={() => close(false)} className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {creating && renderCreate ? (
              <div className="animate-fade-up min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {renderCreate({ initialName: search.trim(), item: form?.item, done: choose, cancel: () => setCreating(false) })}
              </div>
            ) : (
              <>
                <div className="shrink-0 space-y-3 px-5 pt-4 pb-3">
                  <label className="field-shell flex h-11 items-center gap-2 px-3.5">
                    <MagnifyingGlass size={16} className="shrink-0 text-muted" aria-hidden="true" />
                    <input
                      autoFocus={wide}
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={searchPlaceholder}
                      aria-label={searchPlaceholder}
                      className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-field-placeholder"
                    />
                  </label>
                  {renderCreate && createLabel ? (
                    <button
                      type="button"
                      onClick={() => setCreating(true)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-2.5 text-left text-[14px] font-semibold text-primary-soft-foreground transition-colors hover:bg-primary-soft"
                    >
                      <span className="grid size-8 place-items-center rounded-lg bg-primary text-white">
                        <Plus size={16} weight="bold" aria-hidden="true" />
                      </span>
                      {search.trim() ? `${createLabel} “${search.trim()}”` : createLabel}
                    </button>
                  ) : null}
                </div>
                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-5">
                  {isLoading
                    ? Array.from({ length: 5 }).map((_, index) => <li key={index} className="mx-2 h-14 animate-pulse rounded-xl bg-default" />)
                    : null}
                  {!isLoading && visible.length === 0 ? (
                    <li className="px-2 py-10 text-center text-[13px] text-muted">{search.trim() ? `Nothing matches “${search.trim()}”.` : emptyText}</li>
                  ) : null}
                  {!isLoading
                    ? visible.map((item, index) => {
                        const active = item.id === selectedId;
                        return (
                          <li key={item.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 20}ms` }}>
                            <button
                              type="button"
                              onClick={() => pick(item)}
                              className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors ${active ? "bg-primary-soft" : "hover:bg-surface-secondary"}`}
                            >
                              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-[13px] font-bold">{initialsOf(item.label)}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-semibold">{item.label}</span>
                                {item.description ? <span className="block truncate text-[12px] text-muted">{item.description}</span> : null}
                              </span>
                              {item.meta ? <span className="shrink-0 text-[12px] font-medium text-muted tabular">{item.meta}</span> : null}
                              {active ? (
                                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-white">
                                  <Check size={12} weight="bold" aria-hidden="true" />
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })
                    : null}
                </ul>
              </>
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary and success                                                         */
/* -------------------------------------------------------------------------- */

export interface SummaryRow {
  label: string;
  value: ReactNode;
  tone?: "muted" | "strong" | "positive" | "negative";
}

export function SummaryPanel({ title = "Summary", rows, total, note }: { title?: string; rows: SummaryRow[]; total: { label: string; value: ReactNode }; note?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <dl className="mt-4 space-y-2.5 text-[13px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="text-muted">{row.label}</dt>
            <dd
              className={`font-semibold tabular ${
                row.tone === "positive" ? "text-primary" : row.tone === "negative" ? "text-danger" : row.tone === "muted" ? "text-muted" : "text-foreground"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-separator pt-4">
        <span className="text-[13px] font-medium text-muted">{total.label}</span>
        <span key={String(total.value)} className="animate-fade-up text-[24px] leading-none font-bold tracking-tight tabular">
          {total.value}
        </span>
      </div>
      {note ? <p className="mt-3 text-[12px] text-muted">{note}</p> : null}
    </section>
  );
}

export function SuccessPanel({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="animate-fade-up mx-auto flex max-w-md flex-col items-center py-12 text-center">
      <span className="animate-pop grid size-16 place-items-center rounded-full bg-primary text-white ring-8 ring-primary/15">
        <Check size={30} weight="bold" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-[22px] font-bold tracking-[-0.02em]">{title}</h1>
      {description ? <p className="mt-2 text-[14px] text-muted">{description}</p> : null}
      {children ? <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">{children}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Multi-select chips                                                          */
/* -------------------------------------------------------------------------- */

export interface ChipOption {
  key: string;
  label: string;
  description?: string;
}

/** Toggle several options on and off. Used for outlets, collections and similar lists. */
export function ChipMultiSelect({
  label,
  description,
  options,
  value,
  onChange,
  emptyText,
  trailing,
}: {
  label?: string;
  description?: string;
  options: ChipOption[];
  value: string[];
  onChange: (value: string[]) => void;
  emptyText?: ReactNode;
  /** Extra control after the chips, e.g. "+ New collection". */
  trailing?: ReactNode;
}) {
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  return (
    <div className="space-y-1.5">
      {label ? <p className="text-[13px] font-medium">{label}</p> : null}
      {description && options.length ? <p className="text-[12px] text-muted">{description}</p> : null}
      <div role="group" aria-label={label} className="flex flex-wrap gap-2 pt-0.5">
        {options.length === 0 && emptyText ? <p className="text-[13px] text-muted">{emptyText}</p> : null}
        {options.map((option) => {
          const active = value.includes(option.key);
          return (
            <button
              key={option.key}
              type="button"
              role="checkbox"
              aria-checked={active}
              title={option.description}
              onClick={() => toggle(option.key)}
              className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-all duration-150 active:scale-[0.97] ${
                active ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border bg-surface text-muted hover:border-field-border-hover hover:text-foreground"
              }`}
            >
              {active ? <Check size={13} weight="bold" className="animate-pop" aria-hidden="true" /> : null}
              {option.label}
            </button>
          );
        })}
        {trailing}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step navigation for multi-step pages                                         */
/* -------------------------------------------------------------------------- */

export function StepNav({
  steps,
  current,
  onStep,
  canJump,
}: {
  steps: { label: string; description?: string }[];
  /** 1-based. */
  current: number;
  onStep: (step: number) => void;
  /** When true (editing), any step can be opened; otherwise only earlier ones. */
  canJump?: boolean;
}) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        const clickable = canJump || number < current;
        return (
          <li key={step.label}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStep(number)}
              aria-current={active ? "step" : undefined}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                active ? "border-primary bg-primary-soft/50" : "border-border bg-surface"
              } ${clickable ? "cursor-pointer hover:border-field-border-hover" : "cursor-default"}`}
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold transition-colors ${
                  done ? "bg-primary text-white" : active ? "bg-foreground text-background" : "bg-surface-secondary text-muted"
                }`}
              >
                {done ? <Check size={13} weight="bold" aria-hidden="true" /> : number}
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-[13px] font-semibold ${active ? "" : "text-muted"}`}>{step.label}</span>
                {step.description ? <span className="hidden truncate text-[12px] text-muted sm:block">{step.description}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
