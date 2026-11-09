"use client";

import { toast } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, ArrowsLeftRight, Money } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Fragment, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { AppTextarea } from "@/components/ui/app-textarea";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/page";
import { moneyApi, moneyKeys } from "@/lib/money";
import { moneyCaptureSchema, type MoneyCaptureValues } from "@/lib/schemas/money.schemas";
import { createIdempotencyKey } from "@/lib/utils";
import { useActiveWorkspace } from "@/stores/workspace-store";

const DIRECTION_OPTIONS = [
  { key: "money_in", label: "Money in" },
  { key: "money_out", label: "Money out" },
  { key: "transfer", label: "Transfer" },
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export type CaptureDirection = MoneyCaptureValues["direction"];

export function MoneyCaptureForm({
  onCreated,
  bare = false,
  initialDirection = "money_out",
}: {
  onCreated?: () => void;
  /** Render without its own card, for use inside a drawer. */
  bare?: boolean;
  initialDirection?: CaptureDirection;
}) {
  const { workspaceId } = useActiveWorkspace();

  if (workspaceId === null) {
    return (
      <Alert
        status="info"
        title="Choose a space first"
        description="Switch to Personal or Business to record money. All spaces is a read-only summary."
      />
    );
  }

  // Keyed by workspace: switching spaces resets the form, so accounts picked in
  // one workspace can never be submitted against another.
  return <CaptureForm key={workspaceId} workspaceId={workspaceId} onCreated={onCreated} bare={bare} initialDirection={initialDirection} />;
}

function CaptureForm({
  workspaceId,
  onCreated,
  bare,
  initialDirection,
}: {
  workspaceId: number;
  onCreated?: () => void;
  bare: boolean;
  initialDirection: CaptureDirection;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // One key per intended record, so a retry can never post it twice.
  const idempotencyKey = useRef(createIdempotencyKey());

  const form = useForm<MoneyCaptureValues>({
    resolver: zodResolver(moneyCaptureSchema),
    defaultValues: {
      direction: initialDirection,
      amount: "",
      effective_date: today(),
      money_account_id: "",
      destination_account_id: "",
      category_id: "",
      purpose: "",
      counterparty_name: "",
      notes: "",
    },
  });
  const direction = useWatch({ control: form.control, name: "direction" });
  const accountId = useWatch({ control: form.control, name: "money_account_id" });

  const accounts = useQuery({
    queryKey: moneyKeys.accounts(workspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId }),
  });
  const categories = useQuery({
    queryKey: moneyKeys.categories(workspaceId, direction),
    queryFn: () => moneyApi.listCategories({ workspaceId, direction }),
    enabled: direction !== "transfer",
  });

  const selectedAccount = accounts.data?.find((account) => String(account.id) === accountId);
  const currency = selectedAccount?.currency ?? "NGN";
  const exponent = selectedAccount?.currency_exponent ?? 2;
  const accountOptions = (accounts.data ?? []).map((account) => ({
    key: String(account.id),
    label: `${account.name} · ${account.currency}`,
  }));

  const mutation = useMutation({
    mutationFn: (values: MoneyCaptureValues) =>
      moneyApi.createTransaction({
        workspaceId,
        idempotencyKey: idempotencyKey.current,
        direction: values.direction,
        amount: values.amount,
        currency,
        effective_date: values.effective_date,
        money_account_id: Number(values.money_account_id),
        destination_account_id:
          values.direction === "transfer" ? Number(values.destination_account_id) : undefined,
        category_id:
          values.direction !== "transfer" && values.category_id ? Number(values.category_id) : undefined,
        purpose: values.purpose || "other",
        counterparty_name: values.counterparty_name || undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      idempotencyKey.current = createIdempotencyKey();
      setError(null);
      toast.success("Record saved");
      void queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(workspaceId) });
      onCreated?.();
      if (!bare) router.push("/transactions");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const heading = bare ? null : (
    <div className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Money size={22} aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-[16px] font-bold text-foreground">Record money</h2>
        <p className="mt-0.5 text-[13px] text-muted">Save a confirmed income, expense, or transfer.</p>
      </div>
    </div>
  );
  const Wrapper = bare ? Fragment : DashboardCard;

  return (
    <Wrapper>
      {heading}

      {error ? <Alert status="error" description={error} className="mt-5" onDismiss={() => setError(null)} /> : null}

      <form
        noValidate
        className={bare ? "grid gap-5" : "mt-6 grid gap-5"}
        onSubmit={(event) => {
          void form.handleSubmit((values) => mutation.mutate(values))(event);
        }}
      >
        <Controller
          control={form.control}
          name="direction"
          render={({ field }) => (
            <div>
              <p className="mb-2 text-[13px] font-medium text-foreground">What happened?</p>
              <Segmented aria-label="Transaction type" options={DIRECTION_OPTIONS} value={field.value} onChange={field.onChange} />
            </div>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="amount"
            render={({ field, fieldState }) => (
              <MoneyInput
                label="Amount"
                placeholder="0.00"
                isRequired
                currency={currency}
                exponent={exponent}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                errorMessage={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="effective_date"
            render={({ field, fieldState }) => (
              <AppInput
                label="Date"
                type="date"
                isRequired
                max={today()}
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                errorMessage={fieldState.error?.message}
              />
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="money_account_id"
            render={({ field, fieldState }) => (
              <AppSelect
                label={direction === "transfer" ? "From account" : direction === "money_in" ? "Money arrived in" : "Paid from"}
                placeholder={accounts.isPending ? "Loading accounts…" : "Choose account"}
                options={accountOptions}
                selectedKey={field.value || undefined}
                onSelectionChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          {direction === "transfer" ? (
            <Controller
              control={form.control}
              name="destination_account_id"
              render={({ field, fieldState }) => (
                <AppSelect
                  label="To account"
                  placeholder="Choose destination"
                  options={accountOptions.filter((option) => option.key !== accountId)}
                  selectedKey={field.value || undefined}
                  onSelectionChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          ) : (
            <Controller
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <AppSelect
                  label="Category"
                  placeholder="Choose category"
                  options={(categories.data ?? []).map((category) => ({ key: String(category.id), label: category.name }))}
                  selectedKey={field.value || undefined}
                  onSelectionChange={field.onChange}
                />
              )}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="purpose"
            render={({ field }) => (
              <AppInput label="Purpose" placeholder="What was this for?" value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />
            )}
          />
          <Controller
            control={form.control}
            name="counterparty_name"
            render={({ field }) => (
              <AppInput label="Customer or supplier" placeholder="Optional external party" value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />
            )}
          />
        </div>

        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <AppTextarea label="Note" placeholder="Optional note or reference" value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />
          )}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <AppButton variant="ghost" label="Cancel" onPress={() => router.back()} />
          <AppButton
            type="submit"
            size="lg"
            label="Confirm and save"
            isLoading={mutation.isPending}
            endContent={direction === "transfer" ? <ArrowsLeftRight /> : <ArrowRight />}
          />
        </div>
      </form>
    </Wrapper>
  );
}
