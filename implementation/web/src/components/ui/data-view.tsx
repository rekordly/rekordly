"use client";

// Every list in the app: a quiet table on desktop or compact cards, with one
// remembered choice. Phones always get cards, because wide tables do not fit.

import { Rows, SquaresFour } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { Segmented } from "@/components/ui/page";
import { useUIStore } from "@/stores/ui-store";

export interface DataColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export interface DataViewProps<T> {
  title: string;
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  columns: DataColumn<T>[];
  renderCard: (row: T) => ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  empty: ReactNode;
  /** Filters or other controls beside the view switch. */
  toolbar?: ReactNode;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

const VIEW_OPTIONS = [
  { key: "table", label: "Table", icon: Rows },
  { key: "cards", label: "Cards", icon: SquaresFour },
] as const;

export function DataView<T>({
  title,
  rows,
  rowKey,
  columns,
  renderCard,
  isLoading = false,
  isError = false,
  empty,
  toolbar,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: DataViewProps<T>) {
  const view = useUIStore((state) => state.recordView);
  const setView = useUIStore((state) => state.setRecordView);
  const isReady = !isLoading && !isError && rows.length > 0;

  const cards = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <div key={rowKey(row)}>{renderCard(row)}</div>
      ))}
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold text-foreground">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          <div className="hidden md:block">
            <Segmented size="sm" aria-label="List view" options={VIEW_OPTIONS} value={view} onChange={setView} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <DashboardCard className="space-y-3" aria-label={`Loading ${title.toLowerCase()}`}>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-xl bg-default" />
          ))}
        </DashboardCard>
      ) : isError ? (
        <Alert status="error" description={`Unable to load ${title.toLowerCase()} for this workspace.`} />
      ) : rows.length === 0 ? (
        <DashboardCard className="p-0">{empty}</DashboardCard>
      ) : null}

      {isReady ? (
        <>
          <div className="md:hidden">{cards}</div>
          <div className="hidden md:block">
            {view === "cards" ? (
              cards
            ) : (
              <DashboardCard className="overflow-x-auto p-0 scroll-thin">
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
                    {rows.map((row) => (
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
              </DashboardCard>
            )}
          </div>
          {hasMore ? (
            <div className="flex justify-center">
              <AppButton variant="tertiary" label="Load more" isLoading={isLoadingMore} onPress={onLoadMore} />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
