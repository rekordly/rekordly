"use client";

import { Paperclip, Receipt } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { personalApi, personalKeys } from "@/lib/personal-finance";
import { WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const ACTIVITY_TABS = [
  { key: "all", label: "All" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "transfers", label: "Transfers" },
  { key: "loans", label: "Loans" },
  { key: "investments", label: "Investments" },
  { key: "assets", label: "Assets" },
  { key: "drafts", label: "Drafts / Needs review" },
] as const;

type ActivityTab = (typeof ACTIVITY_TABS)[number]["key"];

function PersonalActivityContent({ workspaceId }: WorkspaceInfo) {
  const [tab, setTab] = useState<ActivityTab>("all");
  const [cursor, setCursor] = useState<{ date: string; id: number } | undefined>(undefined);
  const now = new Date();
  const [fromDate, setFromDate] = useState(format(subDays(now, 30), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(now, "yyyy-MM-dd"));

  const activity = useQuery({
    queryKey: [...personalKeys.activity(workspaceId, tab, fromDate, toDate), cursor?.date ?? "", cursor?.id ?? 0],
    queryFn: () =>
      personalApi.listActivity(workspaceId, {
        tab,
        from_date: fromDate,
        to_date: toDate,
        cursor_date: cursor?.date,
        cursor_id: cursor?.id,
        limit: 25,
      }),
  });

  const isDrafts = tab === "drafts";
  const rows = activity.data?.items ?? [];
  const drafts = activity.data?.drafts ?? [];

  return (
    <Page>
      <PageHeader
        title="Personal Activity"
        description="Bounded personal ledger activity. Drafts never affect posted balances."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          aria-label="Activity filter"
          options={ACTIVITY_TABS}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setCursor(undefined);
          }}
        />
        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setCursor(undefined);
            }}
            className="rounded-xl border border-border bg-background px-2.5 py-1.5"
          />
          <span className="text-muted">to</span>
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setCursor(undefined);
            }}
            className="rounded-xl border border-border bg-background px-2.5 py-1.5"
          />
        </div>
      </div>

      {isDrafts ? (
        <DataView
          title="Drafts needing review"
          rows={drafts}
          rowKey={(d) => d.id}
          isLoading={activity.isPending}
          isError={activity.isError}
          columns={[
            { key: "purpose", label: "Draft", render: (d) => <span className="font-medium capitalize">{d.purpose.replace(/_/g, " ")}</span> },
            { key: "date", label: "Effective date", render: (d) => <span className="text-xs text-muted">{formatDate(d.effective_date)}</span> },
            { key: "amount", label: "Amount", align: "right", render: (d) => <span className="tabular">{formatMinorAmount(d.amount_minor, d.currency, d.currency_exponent)}</span> },
            { key: "state", label: "Status", render: (d) => <StatusPill tone="warning">{d.state.replace(/_/g, " ")}</StatusPill> },
          ]}
          renderCard={(d) => (
            <RecordCard
              icon={<Receipt size={18} weight="duotone" aria-hidden="true" />}
              reference={formatDate(d.effective_date)}
              title={d.purpose.replace(/_/g, " ")}
              amount={formatMinorAmount(d.amount_minor, d.currency, d.currency_exponent)}
              status={<StatusPill tone="warning">{d.state.replace(/_/g, " ")}</StatusPill>}
            />
          )}
          empty={
            <EmptyState
              icon={Receipt}
              title="No drafts needing review"
              description="Saved or AI-assisted drafts appear here before confirmation."
            />
          }
        />
      ) : (
        <>
          <DataView
            title="Personal activity"
            rows={rows}
            rowKey={(r) => r.id}
            isLoading={activity.isPending}
            isError={activity.isError}
            columns={[
              {
                key: "purpose",
                label: "Description",
                render: (r) => (
                  <div className="min-w-0">
                    <p className="font-medium text-foreground capitalize">
                      {r.category_name ?? r.purpose.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted">
                      {r.account_name ?? "Account"}
                      {r.destination_account_name ? ` -> ${r.destination_account_name}` : ""}
                      {r.counterparty_name ? ` · ${r.counterparty_name}` : ""}
                    </p>
                  </div>
                ),
              },
              { key: "date", label: "Date", render: (r) => <span className="text-xs text-muted">{formatDate(r.effective_date)}</span> },
              {
                key: "amount",
                label: "Amount",
                align: "right",
                render: (r) => (
                  <span className="tabular font-semibold">
                    {formatMinorAmount(r.amount_minor, r.currency, r.currency_exponent)}
                  </span>
                ),
              },
              {
                key: "status",
                label: "Status",
                render: (r) => (
                  <div className="flex items-center gap-1.5">
                    <StatusPill tone={r.status === "posted" ? "success" : "neutral"}>{r.status}</StatusPill>
                    {r.attachment_count > 0 ? <Paperclip size={14} className="text-muted" aria-label="Has attachment" /> : null}
                  </div>
                ),
              },
            ]}
            renderCard={(r) => (
              <RecordCard
                icon={<Receipt size={18} weight="duotone" aria-hidden="true" />}
                reference={`${formatDate(r.effective_date)} · ${r.account_name ?? "Account"}`}
                title={r.category_name ?? r.purpose.replace(/_/g, " ")}
                amount={formatMinorAmount(r.amount_minor, r.currency, r.currency_exponent)}
                status={<StatusPill tone={r.status === "posted" ? "success" : "neutral"}>{r.status}</StatusPill>}
              />
            )}
            empty={
              <EmptyState
                icon={Receipt}
                title="No personal activity in this filter"
                description="Adjust the date range or record income, expenses, transfers, loans, investments, or assets."
              />
            }
          />
          {activity.data?.next_cursor ? (
            <div className="flex justify-end">
              <AppButton
                size="sm"
                variant="secondary"
                label="Next page"
                onPress={() => setCursor(activity.data?.next_cursor)}
              />
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}

export function PersonalActivityPage() {
  return (
    <WorkspaceGate>
      {(info) => <PersonalActivityContent {...info} />}
    </WorkspaceGate>
  );
}
