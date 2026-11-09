"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, ArrowsLeftRight, Plus, Spinner, Trash } from "@phosphor-icons/react";
import { useState } from "react";

import { Alert, Button, SurfaceCard } from "@/components/ui";
import { useSessionStore } from "@/stores/auth-store";
import { moneyApi } from "@/lib/money-api";
import { formatMinorAmount } from "@/lib/money";
import type { MoneyTransaction } from "@/types/finance";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { MoneyCaptureForm } from "./money-capture-form";

function directionIcon(direction: MoneyTransaction["direction"]) { return direction === "money_in" ? <ArrowDownLeft size={18} weight="duotone" /> : direction === "money_out" ? <ArrowUpRight size={18} weight="duotone" /> : <ArrowsLeftRight size={18} weight="duotone" />; }

export function TransactionList() {
  const user = useSessionStore((state) => state.user);
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const workspaceId = activeWorkspace === "all" ? 0 : activeWorkspace ?? user?.workspaces[0]?.id ?? 0;
  const queryClient = useQueryClient();
  const [showCapture, setShowCapture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transactions = useQuery({ queryKey: ["money", "transactions", workspaceId], queryFn: () => moneyApi.listTransactions({ workspaceId }), enabled: workspaceId > 0 });
  const voidMutation = useMutation({ mutationFn: (id: number) => moneyApi.voidTransaction(workspaceId, id, "Corrected from transaction history"), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["money", "transactions", workspaceId] }), onError: (mutationError: Error) => setError(mutationError.message) });
  return <div className="space-y-6">{showCapture ? <MoneyCaptureForm onCreated={() => setShowCapture(false)} /> : null}<div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Money history</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Transactions</h1><p className="mt-2 text-sm text-muted-foreground">Confirmed income, expenses, transfers, and drafts for the active workspace.</p></div><Button startIcon={<Plus />} onPress={() => setShowCapture((current) => !current)}>{showCapture ? "Close capture" : "Record transaction"}</Button></div>{error ? <Alert status="error" description={error} /> : null}<SurfaceCard className="p-0 shadow-none"><div className="border-b border-border px-5 py-4 text-sm font-semibold">Recent activity</div>{transactions.isPending ? <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Spinner className="animate-spin" />Loading transactions…</div> : transactions.error ? <div className="p-8"><Alert status="error" description="Unable to load transactions for this workspace." /></div> : transactions.data?.length ? <div className="divide-y divide-border">{transactions.data.map((transaction) => <div key={transaction.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><div className={`grid size-9 place-items-center rounded-xl ${transaction.direction === "money_in" ? "bg-primary-soft text-primary" : transaction.direction === "money_out" ? "bg-danger-soft text-danger" : "bg-secondary-soft text-secondary"}`}>{directionIcon(transaction.direction)}</div><div className="min-w-40 flex-1"><p className="text-sm font-semibold">{transaction.purpose || "Transaction"}</p><p className="mt-1 text-xs text-muted-foreground">{transaction.effective_date} · {transaction.status}{transaction.counterparty_name ? ` · ${transaction.counterparty_name}` : ""}</p></div><p className={`text-sm font-semibold ${transaction.direction === "money_in" ? "text-primary" : "text-foreground"}`}>{transaction.direction === "money_in" ? "+" : transaction.direction === "money_out" ? "−" : ""}{formatMinorAmount(transaction.amount_minor, transaction.currency, transaction.currency_exponent)}</p>{transaction.status === "posted" ? <Button variant="ghost" size="sm" isIconOnly aria-label="Void transaction" isDisabled={voidMutation.isPending} onPress={() => voidMutation.mutate(transaction.id)}><Trash /></Button> : null}</div>)}</div> : <div className="p-10 text-center"><p className="text-sm font-medium">No transactions yet</p><p className="mt-1 text-sm text-muted-foreground">Record your first income, expense, or transfer to start the history.</p><Button className="mt-4" startIcon={<Plus />} onPress={() => setShowCapture(true)}>Record transaction</Button></div>}</SurfaceCard></div>;
}
