"use client";

// Every list in the app: search, table or compact cards, and page controls.
// Phones always get cards, because wide tables do not fit.

import { CaretLeft, CaretRight, MagnifyingGlass, Rows, SquaresFour } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { AppSelect } from "@/components/ui/app-select";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { EmptyState, Segmented } from "@/components/ui/page";
import { useUIStore } from "@/stores/ui-store";

export interface DataColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
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
}

const VIEW_OPTIONS = [
  { key: "table", label: "Table", icon: Rows },
  { key: "cards", label: "Cards", icon: SquaresFour },
] as const;

const PAGE_SIZES = [10, 25, 50, 100].map((size) => ({ key: String(size), label: String(size) }));

const PAGER_BUTTON =
  "grid size-8 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-default disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

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
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Previous page" className={PAGER_BUTTON} disabled={!hasPrevious} onClick={onPrevious}>
          <CaretLeft size={16} aria-hidden="true" />
        </button>
        <span className="tabular px-2 text-foreground">
          Page {page}
          {totalPages ? <span className="text-muted"> of {totalPages}</span> : null}
        </span>
        <button type="button" aria-label="Next page" className={PAGER_BUTTON} disabled={!hasNext} onClick={onNext}>
          <CaretRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function DataView<T>({
  title,
  rows,
  rowKey,
  columns,
  renderCard,
  isLoading = false,
  isError = false,
  empty,
  searchPlaceholder = "Search",
  server,
  getSearchText,
}: DataViewProps<T>) {
  const view = useUIStore((state) => state.recordView);
  const setView = useUIStore((state) => state.setRecordView);
  const pageSize = useUIStore((state) => state.pageSize);

  const [localSearch, setLocalSearch] = useState("");
  const [localPage, setLocalPage] = useState(1);
  const search = server ? server.search : localSearch;

  const filtered = useMemo(() => {
    const term = localSearch.trim().toLowerCase();
    if (server || !term || !getSearchText) return rows;
    return rows.filter((row) => getSearchText(row).toLowerCase().includes(term));
  }, [getSearchText, localSearch, rows, server]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentLocalPage = Math.min(localPage, totalPages);
  const visibleRows = server ? rows : filtered.slice((currentLocalPage - 1) * pageSize, currentLocalPage * pageSize);

  const showSearch = Boolean(server || getSearchText);
  const isEmpty = !isLoading && !isError && visibleRows.length === 0;
  const isReady = !isLoading && !isError && visibleRows.length > 0;

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

  const cards = (
    <>
      <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${server?.isChanging ? "opacity-60" : ""}`}>
        {visibleRows.map((row) => (
          <div key={rowKey(row)}>{renderCard(row)}</div>
        ))}
      </div>
      <DashboardCard className="mt-3 p-0">{footer}</DashboardCard>
    </>
  );

  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {showSearch ? (
          <label className="flex h-10 w-full max-w-xs items-center gap-2.5 rounded-full bg-surface px-4">
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
        ) : (
          <span />
        )}
        <div className="hidden shrink-0 md:block">
          <Segmented size="sm" aria-label="List view" options={VIEW_OPTIONS} value={view} onChange={setView} />
        </div>
      </div>

      {isLoading ? (
        <DashboardCard className="space-y-3" aria-label={`Loading ${title.toLowerCase()}`}>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-xl bg-default" />
          ))}
        </DashboardCard>
      ) : null}

      {isError ? <Alert status="error" description={`Unable to load ${title.toLowerCase()} for this workspace.`} /> : null}

      {isEmpty ? (
        <DashboardCard className="p-0">
          {search.trim() ? <EmptyState icon={MagnifyingGlass} title="No results" description={`Nothing matches “${search.trim()}”.`} /> : empty}
        </DashboardCard>
      ) : null}

      {isReady ? (
        <>
          <div className="md:hidden">{cards}</div>
          <div className="hidden md:block">
            {view === "cards" ? (
              cards
            ) : (
              <DashboardCard className="overflow-hidden p-0">
                <div className={`scroll-thin overflow-x-auto ${server?.isChanging ? "opacity-60" : ""}`}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        {columns.map((column) => (
                          <th key={column.key} className={column.align === "right" ? "text-right" : undefined}>
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={rowKey(row)}>
                          {columns.map((column) => (
                            <td key={column.key} className={column.align === "right" ? "text-right" : undefined}>
                              {column.render(row)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-separator">{footer}</div>
              </DashboardCard>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
