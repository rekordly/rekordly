"use client";

import { toast } from "@heroui/react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { StatusPill, type StatusTone } from "@/components/ui/page";
import { capitalise } from "@/lib/format";
import { financeApi, formatMinorAmount, listRecords, moneyApi, moneyKeys, RECORD_PAGE_SIZE, type RecordResource } from "@/lib/money";
import { createIdempotencyKey } from "@/lib/utils";
import { useActiveWorkspace } from "@/stores/workspace-store";
import type { MinorAmount } from "@/types/finance";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface WorkspaceInfo {
  workspaceId: number;
  currency: string;
  isBusiness: boolean;
}

/** Writes need one real workspace; "All spaces" is a read-only owner summary. */
export function WorkspaceGate({
  businessOnly = false,
  children,
}: {
  businessOnly?: boolean;
  children: (workspace: WorkspaceInfo) => ReactNode;
}) {
  const { active, mode, switchSpace } = useActiveWorkspace();

  if (!active) {
    return (
      <Alert
        status="info"
        title="Choose a space first"
        description="Switch to Personal or Business from the sidebar. All spaces is a read-only summary."
      />
    );
  }
  if (businessOnly && mode !== "business") {
    return (
      <div className="space-y-3">
        <Alert status="info" title="This is a business feature" description="Switch to your Business space to use it." />
        <AppButton label="Switch to Business" onPress={() => switchSpace("business")} />
      </div>
    );
  }
  return <>{children({ workspaceId: active.id, currency: active.base_currency, isBusiness: mode === "business" })}</>;
}

/** Cursor-paged list for one workspace. */
export function useRecords<T extends { id: number }>(
  resource: RecordResource,
  workspaceId: number,
  params: Record<string, string | undefined> = {},
) {
  const query = useInfiniteQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), resource, params],
    queryFn: ({ pageParam }) => listRecords<T>(workspaceId, resource, { ...params, before_id: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.length === RECORD_PAGE_SIZE ? lastPage[lastPage.length - 1]?.id : undefined,
  });
  const rows = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  return { ...query, rows };
}

/** A workspace write: one idempotency key per attempt, then fresh figures everywhere. */
export function useFinanceAction<TVariables>(
  workspaceId: number,
  run: (variables: TVariables, idempotencyKey: string) => Promise<unknown>,
  options: { success: string; onDone?: () => void },
) {
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(createIdempotencyKey());
  return useMutation({
    mutationFn: (variables: TVariables) => run(variables, idempotencyKey.current),
    onSuccess: () => {
      idempotencyKey.current = createIdempotencyKey();
      toast.success(options.success);
      void queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(workspaceId) });
      options.onDone?.();
    },
    onError: (error: Error) => {
      toast.danger(error.message);
    },
  });
}

export function useAccountOptions(workspaceId: number) {
  const accounts = useQuery({
    queryKey: moneyKeys.accounts(workspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId }),
  });
  const options = (accounts.data ?? []).map((account) => ({
    key: String(account.id),
    label: `${account.name} · ${account.currency}`,
  }));
  return { ...accounts, options };
}

export function useContacts(workspaceId: number, kind: "customers" | "suppliers") {
  return useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "contacts", kind],
    queryFn: () => financeApi.listContacts(workspaceId, kind),
  });
}

export function useCategoryOptions(workspaceId: number, direction: string) {
  const categories = useQuery({
    queryKey: moneyKeys.categories(workspaceId, direction),
    queryFn: () => moneyApi.listCategories({ workspaceId, direction }),
  });
  return (categories.data ?? []).map((category) => ({ key: String(category.id), label: category.name }));
}

const STATUS_TONES: Readonly<Record<string, StatusTone>> = {
  paid: "success",
  posted: "success",
  finalized: "accent",
  partially_paid: "warning",
  reversed: "warning",
  unpaid: "brand",
  draft: "neutral",
  voided: "danger",
};

export function StatusBadge({ status }: { status: string }) {
  return <StatusPill tone={STATUS_TONES[status] ?? "neutral"}>{capitalise(status.replace(/_/g, " "))}</StatusPill>;
}

export function money(amount: MinorAmount, record: { currency: string; currency_exponent: number }): string {
  return formatMinorAmount(amount, record.currency, record.currency_exponent);
}
