"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowsLeftRight, Money, Spinner } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert, Button, SurfaceCard, TextField } from "@/components/ui";
import { useSessionStore } from "@/lib/auth/session-store";
import { moneyApi } from "@/lib/api/money";
import { useWorkspaceStore } from "@/lib/workspace/workspace-store";

type Direction = "money_in" | "money_out" | "transfer";

function today() { return new Date().toISOString().slice(0, 10); }

export function MoneyCaptureForm({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const queryClient = useQueryClient();
  const workspaceId = activeWorkspace === "all" ? 0 : activeWorkspace ?? user?.workspaces[0]?.id ?? 0;
  const [direction, setDirection] = useState<Direction>("money_out");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const accounts = useQuery({ queryKey: ["money", "accounts", workspaceId], queryFn: () => moneyApi.listAccounts({ workspaceId }), enabled: workspaceId > 0 });
  const categories = useQuery({ queryKey: ["money", "categories", workspaceId, direction], queryFn: () => moneyApi.listCategories({ workspaceId, direction }), enabled: workspaceId > 0 });
  const mutation = useMutation({
    mutationFn: () => moneyApi.createTransaction({ workspaceId, direction, amount, currency: "NGN", effective_date: date, money_account_id: Number(accountId), destination_account_id: direction === "transfer" ? Number(destinationId) : undefined, category_id: direction === "transfer" ? undefined : Number(categoryId) || undefined, purpose: purpose.trim() || "other", counterparty_name: counterparty.trim() || undefined, notes: notes.trim() || undefined }),
  onSuccess: () => { setError(null); queryClient.invalidateQueries({ queryKey: ["money"] }); onCreated?.(); router.push("/transactions"); },
    onError: (mutationError: Error) => setError(mutationError.message),
  });
  const canSubmit = useMemo(() => workspaceId > 0 && amount.trim() !== "" && accountId !== "" && date !== "" && (direction === "transfer" ? destinationId !== "" && destinationId !== accountId : true), [accountId, amount, date, destinationId, direction, workspaceId]);
  const accountCurrency = accounts.data?.find((account) => String(account.id) === accountId)?.currency ?? "NGN";

  return <SurfaceCard className="shadow-none"><div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><Money size={22} weight="duotone" /></div><div><h2 className="font-heading text-lg font-semibold">Record money</h2><p className="mt-1 text-sm text-muted-foreground">Save a clear draft or post a confirmed income, expense, or transfer.</p></div></div>
    {error ? <Alert status="error" description={error} className="mt-5" /> : null}
    <div className="mt-6 grid gap-5">
      <div><p className="mb-2 text-sm font-semibold">What happened?</p><div className="grid grid-cols-3 gap-2">{(["money_in", "money_out", "transfer"] as Direction[]).map((item) => <button key={item} type="button" onClick={() => setDirection(item)} className={`rounded-xl border px-3 py-3 text-sm font-medium capitalize ${direction === item ? "border-primary bg-primary-soft text-primary" : "border-border bg-background"}`}>{item === "money_in" ? "Money in" : item === "money_out" ? "Money out" : "Transfer"}</button>)}</div></div>
      <div className="grid gap-4 sm:grid-cols-2"><TextField label="Amount" value={amount} onChange={setAmount} placeholder="0.00" inputMode="decimal" isRequired /><TextField label="Date" type="text" value={date} onChange={setDate} placeholder="YYYY-MM-DD" isRequired /></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">{direction === "transfer" ? "From account" : direction === "money_in" ? "Money arrived in" : "Paid from"}<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Choose account</option>{accounts.data?.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>{direction === "transfer" ? <label className="grid gap-2 text-sm font-medium">To account<select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Choose destination</option>{accounts.data?.filter((account) => String(account.id) !== accountId).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label> : <label className="grid gap-2 text-sm font-medium">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Choose category</option>{categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}</div>
      <div className="grid gap-4 sm:grid-cols-2"><TextField label="Purpose" value={purpose} onChange={setPurpose} placeholder="What was this for?" /><TextField label="Customer or supplier" value={counterparty} onChange={setCounterparty} placeholder="Optional external party" /></div>
      <TextField label="Note" value={notes} onChange={setNotes} placeholder="Optional note or reference" />
      {amount && /^\d+(\.\d+)?$/.test(amount) ? <p className="text-xs text-muted-foreground">Preview: {accountCurrency} {amount}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><Button variant="ghost" onPress={() => router.back()}>Cancel</Button><Button size="lg" endIcon={direction === "transfer" ? <ArrowsLeftRight /> : <ArrowRight />} isDisabled={!canSubmit || mutation.isPending} onPress={() => mutation.mutate()}>{mutation.isPending ? <Spinner className="animate-spin" /> : null}Confirm and save</Button></div>
    </div>
  </SurfaceCard>;
}
