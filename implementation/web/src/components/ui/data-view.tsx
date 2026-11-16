"use client";

// Every list in the app: one card holding the toolbar (search, filters, view switch),
// the table with row selection and sortable columns, and the page controls.
// Phones always get cards, because wide tables do not fit.

import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CaretUpDown,
  MagnifyingGlass,
  Rows,
  SquaresFour,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { AppSelect } from "@/components/ui/app-select";
import { EmptyState } from "@/components/ui/page";
import { useUIStore, type RecordView } from "@/stores/ui-store";

export interface DataColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Makes the column sortable. Sorting applies to the rows on the current page. */
  sortValue?: (row: T) => string | number;
}

/** Search and paging run on the server for the large financial lists. */
export interface ServerListControls {
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  isChanging: boolean;
}

export interface DataViewProps<T> {
  /** Names the list for screen readers and error messages. */
  title: string;
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  columns: DataColumn<T>[];
  renderCard: (row: T) => ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  empty: ReactNode;
  searchPlaceholder?: string;
  server?: ServerListControls;
  /** The text a short, fully loaded list is searched on. */
  getSearchText?: (row: T) => string;
  /** Filter controls (category, account, date range) shown in the toolbar beside search. */
  filters?: ReactNode;
  /** Toolbar actions on the right, such as Download. */
  toolbarActions?: ReactNode;
  /** Row checkboxes in the table. On by default. */
  selectable?: boolean;
  /** Told whenever the ticked rows change, e.g. for "Export selected". */
  onSelectionChange?: (keys: (string | number)[]) => void;
  /** Title shown at the start of the toolbar, for lists placed inside a page such as the dashboard. */
  heading?: ReactNode;
  /** Embedded lists show a fixed set of rows: no view switch and no page controls. */
  embedded?: boolean;
  /** Optional handler when a row is clicked. */
  onRowClick?: (row: T) => void;
}

type SortState = { key: string; direction: "asc" | "desc" } | null;

const CARD = "rounded-2xl border border-border bg-surface";
const PAGE_SIZES = [10, 25, 50, 100].map((size) => ({ key: String(size), label: String(size) }));
const PAGER_BUTTON =
  "grid size-8 cursor-pointer place-items-center rounded-lg border border-border text-foreground transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
const CHECKBOX = "size-4 cursor-pointer rounded border-border [accent-color:var(--foreground)]";

function ViewSwitch({ value, onChange }: { value: RecordView; onChange: (view: RecordView) => void }) {
  const options = [
    { key: "table" as const, label: "Table view", icon: Rows },
    { key: "cards" as const, label: "Card view", icon: SquaresFour },
  ];
  return (
    <div role="group" aria-label="List view" className="hidden h-9 shrink-0 items-center rounded-lg border border-border p-0.5 md:inline-flex">
      {options.map((option) => {
        const OptionIcon = option.icon;
        const active = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => onChange(option.key)}
            className={`grid h-full w-8 cursor-pointer place-items-center rounded-md transition-colors ${
              active ? "bg-surface-secondary text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <OptionIcon size={16} weight={active ? "bold" : "regular"} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function ListFooter({
  page,
  totalPages,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages?: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const pageSize = useUIStore((state) => state.pageSize);
  const setPageSize = useUIStore((state) => state.setPageSize);

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 text-[13px] text-muted">
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">Rows per page</span>
        <AppSelect
          aria-label="Rows per page"
          size="sm"
          className="w-20"
          options={PAGE_SIZES}
          selectedKey={String(pageSize)}
          onSelectionChange={(key) => setPageSize(Number(key))}
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous page" className={PAGER_BUTTON} disabled={!hasPrevious} onClick={onPrevious}>
          <CaretLeft size={14} aria-hidden="true" />
        </button>
        <span className="tabular px-1 text-foreground">
          Page {page}
          {totalPages ? <span className="text-muted"> of {totalPages}</span> : null}
        </span>
        <button type="button" aria-label="Next page" className={PAGER_BUTTON} disabled={!hasNext} onClick={onNext}>
          <CaretRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function DataView<T>({
  title,
  rows = [],
  rowKey,
  columns,
  renderCard,
  isLoading = false,
  isError = false,
  empty,
  searchPlaceholder = "Search",
  server,
  getSearchText,
  filters,
  toolbarActions,
  selectable = true,
  onSelectionChange,
  heading,
  embedded = false,
  onRowClick,
}: DataViewProps<T>) {
  const storedView = useUIStore((state) => state.recordView);
  const view = embedded ? "table" : storedView;
  const setView = useUIStore((state) => state.setRecordView);
  const pageSize = useUIStore((state) => state.pageSize);

  const [localSearch, setLocalSearch] = useState("");
  const [localPage, setLocalPage] = useState(1);
  const [sort, setSort] = useState<SortState>(null);
  const [selected, setSelected] = useState<ReadonlySet<string | number>>(new Set());
  useEffect(() => {
    onSelectionChange?.(Array.from(selected));
  }, [onSelectionChange, selected]);
  const search = server ? server.search : localSearch;

  const filtered = useMemo(() => {
    const safeRows = rows ?? [];
    const term = localSearch.trim().toLowerCase();
    if (server || !term || !getSearchText) return safeRows;
    return safeRows.filter((row) => getSearchText(row).toLowerCase().includes(term));
  }, [getSearchText, localSearch, rows, server]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentLocalPage = Math.min(localPage, totalPages);
  const pageRows = server || embedded ? filtered : filtered.slice((currentLocalPage - 1) * pageSize, currentLocalPage * pageSize);

  const visibleRows = useMemo(() => {
    const column = sort ? columns.find((candidate) => candidate.key === sort.key) : undefined;
    if (!sort || !column?.sortValue) return pageRows;
    const factor = sort.direction === "asc" ? 1 : -1;
    const value = column.sortValue;
    return [...pageRows].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right), undefined, { numeric: true }) * factor;
    });
  }, [columns, pageRows, sort]);

  const visibleKeys = visibleRows.map(rowKey);
  const selectedOnPage = visibleKeys.filter((key) => selected.has(key)).length;
  const allSelected = visibleKeys.length > 0 && selectedOnPage === visibleKeys.length;

  const toggleAll = () => {
    const next = new Set(selected);
    for (const key of visibleKeys) {
      if (allSelected) next.delete(key);
      else next.add(key);
    }
    setSelected(next);
  };
  const toggleOne = (key: string | number) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };
  const cycleSort = (key: string) =>
    setSort((current) =>
      current?.key !== key ? { key, direction: "asc" } : current.direction === "asc" ? { key, direction: "desc" } : null,
    );

  const showSearch = Boolean(server || getSearchText);
  const isEmpty = !isLoading && !isError && visibleRows.length === 0;
  const isReady = !isLoading && !isError && visibleRows.length > 0;
  const showTable = view === "table";

  const footer = server ? (
    <ListFooter page={server.page} hasPrevious={server.hasPrevious} hasNext={server.hasNext} onPrevious={server.onPrevious} onNext={server.onNext} />
  ) : (
    <ListFooter
      page={currentLocalPage}
      totalPages={totalPages}
      hasPrevious={currentLocalPage > 1}
      hasNext={currentLocalPage < totalPages}
      onPrevious={() => setLocalPage(currentLocalPage - 1)}
      onNext={() => setLocalPage(currentLocalPage + 1)}
    />
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 p-4">
      {heading ? <div className="mr-auto text-[15px] font-semibold">{heading}</div> : null}
      {showSearch ? (
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 sm:w-64">
          <MagnifyingGlass size={16} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            type="search"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => {
              if (server) {
                server.onSearchChange(event.target.value);
              } else {
                setLocalSearch(event.target.value);
                setLocalPage(1);
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-field-placeholder"
          />
        </label>
      ) : null}
      {filters}
      {selectedOnPage > 0 ? (
        <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-surface-secondary px-3 text-[13px] text-foreground">
          {selectedOnPage} selected
          <button type="button" className="cursor-pointer font-semibold text-muted hover:text-foreground" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </span>
      ) : null}
      <div className={`flex items-center gap-2 ${heading ? "" : "ml-auto"}`}>
        {toolbarActions}
        {embedded ? null : <ViewSwitch value={view} onChange={setView} />}
      </div>
    </div>
  );

  const states = (
    <>
      {isLoading ? (
        <div className="space-y-2 px-4 pb-4" aria-label={`Loading ${title.toLowerCase()}`}>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-lg bg-default" />
          ))}
        </div>
      ) : null}
      {isError ? (
        <div className="px-4 pb-4">
          <Alert status="error" description={`Unable to load ${title.toLowerCase()} for this workspace.`} />
        </div>
      ) : null}
      {isEmpty ? (
        <div className="border-t border-separator">
          {search.trim() ? <EmptyState icon={MagnifyingGlass} title="No results" description={`Nothing matches “${search.trim()}”.`} /> : empty}
        </div>
      ) : null}
    </>
  );

  const cardGrid = (
    <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${server?.isChanging ? "opacity-60" : ""}`}>
      {visibleRows.map((row) => (
        <div
          key={rowKey(row)}
          onClick={
            onRowClick
              ? (event) => {
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("a,button,input,label,[role='menuitem']")) return;
                  onRowClick(row);
                }
              : undefined
          }
          className={onRowClick ? "cursor-pointer" : undefined}
        >
          {renderCard(row)}
        </div>
      ))}
    </div>
  );

  const table = (
    <>
      <div className={`scroll-thin overflow-x-auto border-t border-separator ${server?.isChanging ? "opacity-60" : ""}`}>
        <table className="data-table">
          <thead>
            <tr>
              {selectable ? (
                <th className="w-10">
                  <input type="checkbox" aria-label="Select all rows on this page" className={CHECKBOX} checked={allSelected} onChange={toggleAll} />
                </th>
              ) : null}
              {columns.map((column) => {
                const sorted = sort?.key === column.key ? sort.direction : null;
                const SortIcon = sorted === "asc" ? CaretUp : sorted === "desc" ? CaretDown : CaretUpDown;
                return (
                  <th
                    key={column.key}
                    className={column.align === "right" ? "text-right" : undefined}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => cycleSort(column.key)}
                        className={`inline-flex cursor-pointer items-center gap-1 hover:text-foreground ${column.align === "right" ? "flex-row-reverse" : ""}`}
                      >
                        {column.label}
                        <SortIcon size={12} aria-hidden="true" />
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const key = rowKey(row);
              const isSelected = selected.has(key);
              return (
                <tr
                  key={key}
                  data-selected={isSelected || undefined}
                  onClick={
                    onRowClick
                      ? (event) => {
                          const target = event.target as HTMLElement | null;
                          if (target?.closest("a,button,input,label,[role='menuitem']")) return;
                          onRowClick(row);
                        }
                      : undefined
                  }
                  className={onRowClick ? "cursor-pointer" : undefined}
                >
                  {selectable ? (
                    <td className="w-10">
                      <input type="checkbox" aria-label="Select row" className={CHECKBOX} checked={isSelected} onChange={() => toggleOne(key)} />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td key={column.key} className={column.align === "right" ? "text-right" : undefined}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {embedded ? null : <div className="border-t border-separator">{footer}</div>}
    </>
  );

  return (
    <section aria-label={title} className={embedded ? "flex h-full flex-col gap-3" : "space-y-3"}>
      <div className={`${CARD} overflow-hidden ${embedded ? "md:flex-1" : ""}`}>
        {toolbar}
        {states}
        {isReady && showTable ? <div className="hidden md:block">{table}</div> : null}
      </div>

      {isReady ? (
        <div className={showTable ? "md:hidden" : undefined}>
          {cardGrid}
          {embedded ? null : <div className={`${CARD} mt-3`}>{footer}</div>}
        </div>
      ) : null}
    </section>
  );
}
