"use client";

import { toast } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowsLeftRight, CheckCircle, Info } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { AppTextarea } from "@/components/ui/app-textarea";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { MoneyInput } from "@/components/ui/money-input";
import { DetailList, Segmented, StatusPill } from "@/components/ui/page";
import { formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";
import {
  mixedExpenseSchema,
  mixedReimbursementSchema,
  type MixedExpenseValues,
  type MixedReimbursementValues,
} from "@/lib/schemas/money.schemas";
import { createIdempotencyKey } from "@/lib/utils";
import { useActiveWorkspace } from "@/stores/workspace-store";
import type { MixedMoneyConfirmation, MixedMoneyGroup } from "@/types/finance";

const PAYER_OPTIONS = [
  { key: "personal", label: "Personal paid" },
  { key: "business", label: "Business paid" },
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A split external payment is intentionally a dedicated form. It creates two
 * separate records and a due-to/due-from link; it is never a transaction in
 * the All-spaces summary.
 */
export function MixedExpenseForm() {
  const { active, workspaces } = useActiveWorkspace();
  const personalWorkspace = workspaces.find((workspace) => workspace.kind === "personal" && workspace.is_owner);
  const businessWorkspace = workspaces.find((workspace) => workspace.kind === "business" && workspace.is_owner);

  if (!active) {
    return <Alert status="info" title="Choose a space first" description="Mixed expenses need an active Personal or Business space." />;
  }
  if (!personalWorkspace || !businessWorkspace) {
    return (
      <Alert
        status="info"
        title="Both owned spaces are required"
        description="A mixed expense is available only when you own one Personal and one Business space. It keeps both books separate."
      />
    );
  }

  return (
    <MixedExpenseFormFields
      key={`${active.id}-${personalWorkspace.id}-${businessWorkspace.id}`}
      activeWorkspaceId={active.id}
      personalWorkspaceId={personalWorkspace.id}
      businessWorkspaceId={businessWorkspace.id}
      personalCurrency={personalWorkspace.base_currency}
      businessCurrency={businessWorkspace.base_currency}
    />
  );
}

function MixedExpenseFormFields({
  activeWorkspaceId,
  personalWorkspaceId,
  businessWorkspaceId,
  personalCurrency,
  businessCurrency,
}: {
  activeWorkspaceId: number;
  personalWorkspaceId: number;
  businessWorkspaceId: number;
  personalCurrency: string;
  businessCurrency: string;
}) {
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(createIdempotencyKey());
  const [saved, setSaved] = useState<MixedMoneyConfirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<MixedExpenseValues>({
    resolver: zodResolver(mixedExpenseSchema),
    defaultValues: {
      paying_workspace_kind: "personal",
      paying_money_account_id: "",
      total_amount: "",
      personal_amount: "",
      business_amount: "",
      personal_category_id: "",
      business_category_id: "",
      effective_date: today(),
      description: "",
      reference: "",
    },
  });
  const payerKind = useWatch({ control: form.control, name: "paying_workspace_kind" });
  const payerAccountId = useWatch({ control: form.control, name: "paying_money_account_id" });

  const personalAccounts = useQuery({
    queryKey: moneyKeys.accounts(personalWorkspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId: personalWorkspaceId }),
  });
  const businessAccounts = useQuery({
    queryKey: moneyKeys.accounts(businessWorkspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId: businessWorkspaceId }),
  });
  const personalCategories = useQuery({
    queryKey: moneyKeys.categories(personalWorkspaceId, "money_out"),
    queryFn: () => moneyApi.listCategories({ workspaceId: personalWorkspaceId, direction: "money_out" }),
  });
  const businessCategories = useQuery({
    queryKey: moneyKeys.categories(businessWorkspaceId, "money_out"),
    queryFn: () => moneyApi.listCategories({ workspaceId: businessWorkspaceId, direction: "money_out" }),
  });

  useEffect(() => {
    form.setValue("paying_money_account_id", "");
  }, [form, payerKind]);

  const accounts = payerKind === "personal" ? personalAccounts.data ?? [] : businessAccounts.data ?? [];
  const selectedAccount = accounts.find((account) => String(account.id) === payerAccountId);
  const currency = selectedAccount?.currency ?? (payerKind === "personal" ? personalCurrency : businessCurrency);
  const exponent = selectedAccount?.currency_exponent ?? 2;

  const mutation = useMutation({
    mutationFn: (values: MixedExpenseValues) =>
      moneyApi.confirmMixedExpense({
        activeWorkspaceId,
        idempotencyKey: idempotencyKey.current,
        personal_workspace_id: personalWorkspaceId,
        business_workspace_id: businessWorkspaceId,
        paying_workspace_id: payerKind === "personal" ? personalWorkspaceId : businessWorkspaceId,
        paying_money_account_id: Number(values.paying_money_account_id),
        amount: values.total_amount,
        personal_amount: values.personal_amount,
        business_amount: values.business_amount,
        currency,
        effective_date: values.effective_date,
        personal_category_id: Number(values.personal_category_id),
        business_category_id: Number(values.business_category_id),
        description: values.description || undefined,
        reference: values.reference || undefined,
      }),
    onSuccess: (result) => {
      setError(null);
      setSaved(result);
      idempotencyKey.current = createIdempotencyKey();
      toast.success(result.was_duplicate ? "Mixed expense already recorded" : "Mixed expense recorded");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(personalWorkspaceId) }),
        queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(businessWorkspaceId) }),
      ]);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  return (
    <div className="grid max-w-4xl gap-6">
      <DashboardCard>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <ArrowsLeftRight size={21} weight="duotone" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[16px] font-bold text-foreground">Split a mixed expense</h2>
            <p className="mt-0.5 text-[13px] text-muted">One payment, with separate Personal and Business records.</p>
          </div>
        </div>

        <Alert
          className="mt-5"
          status="info"
          title="How this is recorded"
          description="The paying space keeps its expense and a Due-from balance. The other space records its expense and a Due-to balance. You can reimburse it later in one or more payments."
        />

        {error ? <Alert className="mt-5" status="error" description={error} onDismiss={() => setError(null)} /> : null}

        <form noValidate className="mt-6 grid gap-5" onSubmit={(event) => void form.handleSubmit((values) => mutation.mutate(values))(event)}>
          <Controller
            control={form.control}
            name="paying_workspace_kind"
            render={({ field }) => (
              <div>
                <p className="mb-2 text-[13px] font-medium text-foreground">Which space paid?</p>
                <Segmented aria-label="Paying space" options={PAYER_OPTIONS} value={field.value} onChange={field.onChange} />
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="paying_money_account_id"
            render={({ field, fieldState }) => (
              <AppSelect
                label="Paid from"
                isRequired
                placeholder={personalAccounts.isPending || businessAccounts.isPending ? "Loading accounts…" : "Choose account"}
                options={accounts.map((account) => ({ key: String(account.id), label: `${account.name} · ${account.currency}` }))}
                selectedKey={field.value || undefined}
                onSelectionChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="total_amount"
              render={({ field, fieldState }) => (
                <MoneyInput label="Total paid" isRequired placeholder="0.00" currency={currency} exponent={exponent} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} errorMessage={fieldState.error?.message} />
              )}
            />
            <Controller
              control={form.control}
              name="effective_date"
              render={({ field, fieldState }) => (
                <AppInput label="Date" type="date" isRequired max={today()} value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} errorMessage={fieldState.error?.message} />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="personal_amount"
              render={({ field, fieldState }) => (
                <MoneyInput label="Personal portion" isRequired placeholder="0.00" currency={currency} exponent={exponent} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} errorMessage={fieldState.error?.message} />
              )}
            />
            <Controller
              control={form.control}
              name="personal_category_id"
              render={({ field, fieldState }) => (
                <AppSelect label="Personal category" isRequired placeholder="Choose category" options={(personalCategories.data ?? []).map((category) => ({ key: String(category.id), label: category.name }))} selectedKey={field.value || undefined} onSelectionChange={field.onChange} error={fieldState.error?.message} />
              )}
            />
            <Controller
              control={form.control}
              name="business_amount"
              render={({ field, fieldState }) => (
                <MoneyInput label="Business portion" isRequired placeholder="0.00" currency={currency} exponent={exponent} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} errorMessage={fieldState.error?.message} />
              )}
            />
            <Controller
              control={form.control}
              name="business_category_id"
              render={({ field, fieldState }) => (
                <AppSelect label="Business category" isRequired placeholder="Choose category" options={(businessCategories.data ?? []).map((category) => ({ key: String(category.id), label: category.name }))} selectedKey={field.value || undefined} onSelectionChange={field.onChange} error={fieldState.error?.message} />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Controller control={form.control} name="description" render={({ field }) => <AppTextarea label="Description" placeholder="What was this shared expense?" value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />} />
            <Controller control={form.control} name="reference" render={({ field }) => <AppInput label="Reference" placeholder="Optional receipt or bank reference" value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />} />
          </div>

          <div className="flex justify-end pt-1">
            <AppButton type="submit" size="lg" label="Confirm mixed expense" isLoading={mutation.isPending} endContent={<CheckCircle />} />
          </div>
        </form>
      </DashboardCard>

      {saved ? <MixedExpenseReceipt result={saved} activeWorkspaceId={activeWorkspaceId} personalWorkspaceId={personalWorkspaceId} businessWorkspaceId={businessWorkspaceId} onGroupChange={(group) => setSaved((current) => (current ? { ...current, group } : current))} /> : null}
    </div>
  );
}

function MixedExpenseReceipt({
  result,
  activeWorkspaceId,
  personalWorkspaceId,
  businessWorkspaceId,
  onGroupChange,
}: {
  result: MixedMoneyConfirmation;
  activeWorkspaceId: number;
  personalWorkspaceId: number;
  businessWorkspaceId: number;
  onGroupChange: (group: MixedMoneyGroup) => void;
}) {
  const { group } = result;
  const [isSettling, setIsSettling] = useState(false);
  return (
    <DashboardCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-foreground"><CheckCircle size={19} weight="fill" className="text-success" aria-hidden="true" /> Recorded in both books</div>
        <StatusPill tone={group.status === "settled" ? "success" : "warning"}>{group.status === "settled" ? "Settled" : "Reimbursement open"}</StatusPill>
      </div>
      <DetailList
        className="mt-5"
        items={[
          { label: "Personal expense", value: formatMinorAmount(group.personal_amount_minor, group.currency, group.currency_exponent) },
          { label: "Business expense", value: formatMinorAmount(group.business_amount_minor, group.currency, group.currency_exponent) },
          { label: "Still due", value: formatMinorAmount(group.outstanding_amount_minor, group.currency, group.currency_exponent) },
          { label: "Group", value: `#${group.id}` },
        ]}
      />
      <p className="mt-5 flex items-start gap-2 text-[12px] text-muted"><Info size={16} weight="duotone" className="mt-0.5 shrink-0" aria-hidden="true" /> Reimbursements clear the Due-to and Due-from balances without changing either expense amount.</p>
      {group.status === "open" ? <div className="mt-5"><AppButton variant="outline" label={isSettling ? "Close reimbursement" : "Record reimbursement"} onPress={() => setIsSettling((open) => !open)} /></div> : null}
      {isSettling ? <MixedReimbursementForm group={group} activeWorkspaceId={activeWorkspaceId} personalWorkspaceId={personalWorkspaceId} businessWorkspaceId={businessWorkspaceId} onSettled={(next) => { onGroupChange(next); setIsSettling(next.status === "open"); }} /> : null}
    </DashboardCard>
  );
}

function MixedReimbursementForm({
  group,
  activeWorkspaceId,
  personalWorkspaceId,
  businessWorkspaceId,
  onSettled,
}: {
  group: MixedMoneyGroup;
  activeWorkspaceId: number;
  personalWorkspaceId: number;
  businessWorkspaceId: number;
  onSettled: (group: MixedMoneyGroup) => void;
}) {
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(createIdempotencyKey());
  const form = useForm<MixedReimbursementValues>({
    resolver: zodResolver(mixedReimbursementSchema),
    defaultValues: { amount: "", from_money_account_id: "", to_money_account_id: "", effective_date: today(), reference: "" },
  });
  const payerIsPersonal = group.paying_workspace_id === group.personal_workspace_id;
  const fromWorkspaceId = payerIsPersonal ? businessWorkspaceId : personalWorkspaceId;
  const toWorkspaceId = payerIsPersonal ? personalWorkspaceId : businessWorkspaceId;
  const fromAccounts = useQuery({ queryKey: moneyKeys.accounts(fromWorkspaceId), queryFn: () => moneyApi.listAccounts({ workspaceId: fromWorkspaceId }) });
  const toAccounts = useQuery({ queryKey: moneyKeys.accounts(toWorkspaceId), queryFn: () => moneyApi.listAccounts({ workspaceId: toWorkspaceId }) });
  const mutation = useMutation({
    mutationFn: (values: MixedReimbursementValues) => moneyApi.reimburseMixedExpense({
      activeWorkspaceId,
      groupId: group.id,
      idempotencyKey: idempotencyKey.current,
      from_workspace_id: fromWorkspaceId,
      to_workspace_id: toWorkspaceId,
      from_money_account_id: Number(values.from_money_account_id),
      to_money_account_id: Number(values.to_money_account_id),
      amount: values.amount,
      effective_date: values.effective_date,
      expected_version: group.settlement_version,
      reference: values.reference || undefined,
    }),
    onSuccess: (result) => {
      idempotencyKey.current = createIdempotencyKey();
      toast.success(result.group.status === "settled" ? "Mixed expense settled" : "Partial reimbursement recorded");
      onSettled(result.group);
      form.reset({ amount: "", from_money_account_id: "", to_money_account_id: "", effective_date: today(), reference: "" });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(fromWorkspaceId) }),
        queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(toWorkspaceId) }),
      ]);
    },
  });

  return (
    <form className="mt-6 grid gap-4 border-t border-separator pt-5" noValidate onSubmit={(event) => void form.handleSubmit((values) => mutation.mutate(values))(event)}>
      <div>
        <h3 className="text-[14px] font-bold text-foreground">Record a reimbursement</h3>
        <p className="mt-0.5 text-[12px] text-muted">The owing space pays the due balance. The remaining amount is checked on the server.</p>
      </div>
      {mutation.error ? <Alert status="error" description={mutation.error.message} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller control={form.control} name="amount" render={({ field, fieldState }) => <MoneyInput label="Amount to reimburse" isRequired placeholder="0.00" currency={group.currency} exponent={group.currency_exponent} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} errorMessage={fieldState.error?.message} description={`Outstanding: ${formatMinorAmount(group.outstanding_amount_minor, group.currency, group.currency_exponent)}`} />} />
        <Controller control={form.control} name="effective_date" render={({ field, fieldState }) => <AppInput label="Date" type="date" isRequired max={today()} value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} errorMessage={fieldState.error?.message} />} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller control={form.control} name="from_money_account_id" render={({ field, fieldState }) => <AppSelect label="Paying account" isRequired placeholder="Choose account" options={(fromAccounts.data ?? []).map((account) => ({ key: String(account.id), label: `${account.name} · ${account.currency}` }))} selectedKey={field.value || undefined} onSelectionChange={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="to_money_account_id" render={({ field, fieldState }) => <AppSelect label="Receiving account" isRequired placeholder="Choose account" options={(toAccounts.data ?? []).map((account) => ({ key: String(account.id), label: `${account.name} · ${account.currency}` }))} selectedKey={field.value || undefined} onSelectionChange={field.onChange} error={fieldState.error?.message} />} />
      </div>
      <Controller control={form.control} name="reference" render={({ field }) => <AppInput label="Reference" placeholder="Optional transfer or bank reference" value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />} />
      <div className="flex justify-end"><AppButton type="submit" label="Record reimbursement" isLoading={mutation.isPending} /></div>
    </form>
  );
}
