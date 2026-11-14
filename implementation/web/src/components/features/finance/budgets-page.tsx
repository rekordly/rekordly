"use client";

import { ProgressCircle } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Target, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { formatDate } from "@/lib/format";
import { financeApi, moneyKeys } from "@/lib/money";
import { budgetSchema, type BudgetValues } from "@/lib/schemas/finance.schemas";
import type { Budget } from "@/types/finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { money, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";
import { BudgetStats } from "./section-stats";
import { CategoryField } from "@/components/pickers";

const PERIODS = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
  { key: "custom", label: "Custom" },
];

function BudgetProgress({ workspaceId, budget }: { workspaceId: number; budget: Budget }) {
  const status = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "budget-status", budget.id],
    queryFn: () => financeApi.budgetStatus(workspaceId, budget.id),
  });
  if (!status.data) return <div className="size-6 animate-pulse rounded-full bg-default" />;
  const { usage_basis_points: basisPoints, is_over_budget: isOver, usage_percentage_formatted: percent, actual_spending_minor: spent } = status.data;
  return (
    <div className="flex items-center gap-2.5">
      <ProgressCircle aria-label={`${budget.name} used`} value={Math.min(basisPoints / 100, 100)} color={isOver ? "danger" : basisPoints >= 8000 ? "warning" : "success"} size="sm">
        <ProgressCircle.Track>
          <ProgressCircle.TrackCircle />
          <ProgressCircle.FillCircle />
        </ProgressCircle.Track>
      </ProgressCircle>
      <span className="tabular text-xs whitespace-nowrap text-muted">
        {money(spent, budget)} spent · {percent}
      </span>
      {isOver ? <StatusPill tone="danger">Over</StatusPill> : null}
    </div>
  );
}

function BudgetsContent({ workspaceId, currency, isBusiness }: WorkspaceInfo) {
  const [isOpen, setIsOpen] = useState(false);
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const budgets = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "budgets"],
    queryFn: () => financeApi.listBudgets(workspaceId),
  });

  const now = new Date();
  const form = useForm<BudgetValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      name: "",
      amount: "",
      period: "monthly",
      category_id: "",
      start_date: format(startOfMonth(now), "yyyy-MM-dd"),
      end_date: format(endOfMonth(now), "yyyy-MM-dd"),
      notes: "",
    },
  });
  const close = () => {
    setIsOpen(false);
    form.reset();
  };

  const create = useFinanceAction(
    workspaceId,
    (values: BudgetValues, key: string) =>
      financeApi.createBudget(
        workspaceId,
        {
          name: values.name,
          amount: values.amount,
          currency,
          period: values.period,
          scope: isBusiness ? "business" : "personal",
          category_id: values.category_id ? Number(values.category_id) : undefined,
          start_date: values.start_date,
          end_date: values.end_date,
          notes: values.notes || undefined,
        },
        key,
      ),
    { success: "Budget created", onDone: close },
  );
  const remove = useFinanceAction(workspaceId, (budget: Budget) => financeApi.deleteBudget(workspaceId, budget.id), {
    success: "Budget deleted",
    onDone: () => setDeleting(null),
  });

  const actions = (row: Budget) => (
    <AppRowActions
      ariaLabel="Budget actions"
      items={[{ key: "delete", label: "Delete budget", icon: <Trash size={16} aria-hidden="true" />, danger: true, onClick: () => setDeleting(row) }]}
    />
  );

  return (
    <Page>
      <PageHeader
        title="Budgets"
        description="Spending limits, and how close you are to them."
        actions={<AppButton startContent={<Plus weight="bold" />} label="New budget" onPress={() => setIsOpen(true)} />}
      />
      <BudgetStats workspaceId={workspaceId} currency={currency} budgets={budgets.data ?? []} />
      <DataView<Budget>
        title="Budgets"
        searchPlaceholder="Search budgets"
        getSearchText={(row) => row.name}
        rows={budgets.data ?? []}
        rowKey={(row) => row.id}
        isLoading={budgets.isPending}
        isError={budgets.isError}
        empty={
          <EmptyState
            icon={Target}
            title="No budgets yet"
            description="Set a limit for a category and watch your spending against it."
            action={<AppButton startContent={<Plus weight="bold" />} label="New budget" onPress={() => setIsOpen(true)} />}
          />
        }
        columns={[
          { key: "name", label: "Budget", render: (row) => <span className="font-medium text-foreground">{row.name}</span> },
          { key: "period", label: "Period", render: (row) => `${formatDate(row.start_date)} – ${formatDate(row.end_date)}` },
          { key: "progress", label: "Used", render: (row) => <BudgetProgress workspaceId={workspaceId} budget={row} /> },
          { key: "amount", label: "Limit", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.amount_minor, row)}</span> },
          { key: "actions", label: "", align: "right", render: actions },
        ]}
        renderCard={(row) => (
          <article className="space-y-3 rounded-3xl bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[13px] font-semibold text-foreground">{row.name}</h3>
                <p className="text-xs text-muted">{formatDate(row.start_date)} – {formatDate(row.end_date)}</p>
              </div>
              {actions(row)}
            </div>
            <p className="tabular text-[17px] font-bold text-foreground">{money(row.amount_minor, row)}</p>
            <BudgetProgress workspaceId={workspaceId} budget={row} />
          </article>
        )}
      />

      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title="New budget"
        submitLabel="Create budget"
        isSubmitting={create.isPending}
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <TextInputField control={form.control} name="name" label="Name" placeholder="Monthly supplies" isRequired />
        <MoneyField control={form.control} name="amount" label="Limit" currency={currency} isRequired />
        <SelectField control={form.control} name="period" label="Period" options={PERIODS} isRequired />
        <CategoryField control={form.control} name="category_id" label="Category" placeholder="All spending" workspaceId={workspaceId} direction="money_out" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField control={form.control} name="start_date" label="Starts" type="date" isRequired />
          <TextInputField control={form.control} name="end_date" label="Ends" type="date" isRequired />
        </div>
        <NotesField control={form.control} name="notes" label="Notes" />
      </FormDrawer>

      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this budget?"
        description={`${deleting?.name ?? "This budget"} will be removed. Your transactions are not affected.`}
        confirmLabel="Delete budget"
        isLoading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Page>
  );
}

export function BudgetsPage() {
  return <WorkspaceGate>{(workspace) => <BudgetsContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>;
}
