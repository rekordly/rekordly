"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Wallet } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { personalApi, personalKeys } from "@/lib/personal-finance";
import {
  assetAcquireSchema,
  assetCreateSchema,
  assetDisposeSchema,
  manualValuationSchema,
  type AssetAcquireValues,
  type AssetCreateValues,
  type AssetDisposeValues,
  type ManualValuationValues,
} from "@/lib/schemas/personal-finance.schemas";
import type { PersonalAssetRecord } from "@/types/personal-finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "../finance/fields";
import { useAccountOptions, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const ASSET_TYPES = [
  { key: "vehicle", label: "Vehicle" },
  { key: "property", label: "Property" },
  { key: "electronics_equipment", label: "Electronics / Equipment" },
  { key: "personal_item", label: "Valuable personal item" },
  { key: "other", label: "Other asset" },
];

function AssetsContent({ workspaceId, currency, isBusiness }: WorkspaceInfo) {
  const [createOpen, setCreateOpen] = useState(false);
  const [acquireAsset, setAcquireAsset] = useState<PersonalAssetRecord | null>(null);
  const [disposeAsset, setDisposeAsset] = useState<PersonalAssetRecord | null>(null);
  const [valAsset, setValAsset] = useState<PersonalAssetRecord | null>(null);

  const assets = useQuery({
    queryKey: personalKeys.assets(workspaceId),
    queryFn: () => personalApi.listAssets(workspaceId),
    enabled: !isBusiness,
  });
  const accounts = useAccountOptions(workspaceId);
  const today = new Date().toISOString().split("T")[0];

  const createForm = useForm<AssetCreateValues>({
    resolver: zodResolver(assetCreateSchema),
    defaultValues: { name: "", asset_type: "vehicle", notes: "" },
  });
  const acquireForm = useForm<AssetAcquireValues>({
    resolver: zodResolver(assetAcquireSchema),
    defaultValues: { acquisition_date: today, cost: "", is_opening_asset: false, money_account_id: "", notes: "" },
  });
  const disposeForm = useForm<AssetDisposeValues>({
    resolver: zodResolver(assetDisposeSchema),
    defaultValues: { disposal_date: today, proceeds: "", disposal_costs: "0", money_account_id: "", counterparty_name: "", notes: "" },
  });
  const valForm = useForm<ManualValuationValues>({
    resolver: zodResolver(manualValuationSchema),
    defaultValues: { valuation_date: today, value: "", source: "user_manual", notes: "" },
  });

  const createAct = useFinanceAction(
    workspaceId,
    (v: AssetCreateValues, key: string) => personalApi.createAsset(workspaceId, { ...v, currency }, key),
    {
      success: "Asset shell created",
      onDone: () => {
        setCreateOpen(false);
        createForm.reset();
        assets.refetch();
      },
    },
  );
  const acquireAct = useFinanceAction(
    workspaceId,
    (v: AssetAcquireValues, key: string) =>
      personalApi.acquireAsset(
        workspaceId,
        {
          asset_id: acquireAsset!.id,
          acquisition_date: v.acquisition_date,
          cost: v.cost,
          is_opening_asset: v.is_opening_asset,
          money_account_id: v.is_opening_asset || !v.money_account_id ? undefined : Number(v.money_account_id),
          notes: v.notes || undefined,
        },
        key,
      ),
    {
      success: "Asset acquired",
      onDone: () => {
        setAcquireAsset(null);
        acquireForm.reset();
        assets.refetch();
      },
    },
  );
  const disposeAct = useFinanceAction(
    workspaceId,
    (v: AssetDisposeValues, key: string) =>
      personalApi.disposeAsset(
        workspaceId,
        {
          asset_id: disposeAsset!.id,
          disposal_date: v.disposal_date,
          proceeds: v.proceeds,
          disposal_costs: v.disposal_costs || "0",
          money_account_id: Number(v.money_account_id),
          counterparty_name: v.counterparty_name || undefined,
          notes: v.notes || undefined,
        },
        key,
      ),
    {
      success: "Asset disposed",
      onDone: () => {
        setDisposeAsset(null);
        disposeForm.reset();
        assets.refetch();
      },
    },
  );
  const valAct = useFinanceAction(
    workspaceId,
    (v: ManualValuationValues) => personalApi.recordAssetValuation(workspaceId, valAsset!.id, v),
    {
      success: "Manual valuation saved",
      onDone: () => {
        setValAsset(null);
        valForm.reset();
        assets.refetch();
      },
    },
  );

  if (isBusiness) {
    return (
      <Page>
        <PageHeader title="Personal Assets" description="Switch to your Personal space to track personal assets." />
        <Alert status="info" description="Personal assets are separate from Business fixed assets." />
      </Page>
    );
  }

  const isOpening = acquireForm.watch("is_opening_asset");
  const rows = assets.data ?? [];

  return (
    <Page>
      <PageHeader
        title="Personal Assets"
        description="Track vehicles, property, electronics, and valuables with acquisition cost, manual valuation, and controlled disposal."
        actions={<AppButton startContent={<Plus weight="bold" />} label="Add asset" onPress={() => setCreateOpen(true)} />}
      />

      <DataView
        title="Personal assets"
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={assets.isPending}
        isError={assets.isError}
        columns={[
          {
            key: "name",
            label: "Asset",
            render: (r) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="text-xs text-muted">{r.asset_type.replace(/_/g, " ")}</p>
              </div>
            ),
          },
          {
            key: "cost",
            label: "Acquisition cost",
            align: "right",
            render: (r) => <span className="tabular">{formatMinorAmount(r.acquisition_cost_minor, r.currency, r.currency_exponent)}</span>,
          },
          {
            key: "valuation",
            label: "Manual valuation",
            align: "right",
            render: (r) =>
              r.latest_manual_value_minor ? (
                <div className="text-right">
                  <span className="tabular font-medium">
                    {formatMinorAmount(r.latest_manual_value_minor, r.currency, r.currency_exponent)}
                  </span>
                  <p className="text-[11px] text-muted">
                    Est. {r.latest_valuation_date ? formatDate(r.latest_valuation_date) : ""} ({r.latest_valuation_source ?? "manual"})
                  </p>
                </div>
              ) : (
                <span className="text-xs text-muted">Not valued</span>
              ),
          },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusPill tone={r.status === "active" ? "success" : r.status === "disposed" ? "warning" : "neutral"}>{r.status}</StatusPill>,
          },
          {
            key: "actions",
            label: "",
            align: "right",
            render: (r) => (
              <div className="flex items-center justify-end gap-2">
                {r.status === "draft" ? (
                  <AppButton size="sm" variant="secondary" label="Acquire" onPress={() => setAcquireAsset(r)} />
                ) : null}
                {r.status === "active" ? (
                  <>
                    <AppButton size="sm" variant="ghost" label="Value" onPress={() => setValAsset(r)} />
                    <AppButton size="sm" variant="secondary" label="Dispose" onPress={() => setDisposeAsset(r)} />
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
        renderCard={(r) => (
          <RecordCard
            icon={<Wallet size={18} weight="duotone" aria-hidden="true" />}
            reference={r.asset_type.replace(/_/g, " ")}
            title={r.name}
            amount={formatMinorAmount(r.acquisition_cost_minor, r.currency, r.currency_exponent)}
            status={<StatusPill tone={r.status === "active" ? "success" : "neutral"}>{r.status}</StatusPill>}
            meta={[
              {
                label: "Manual value",
                value: r.latest_manual_value_minor
                  ? formatMinorAmount(r.latest_manual_value_minor, r.currency, r.currency_exponent)
                  : "None",
              },
            ]}
            actions={
              r.status === "draft" ? (
                <AppButton size="sm" variant="secondary" label="Acquire" onPress={() => setAcquireAsset(r)} />
              ) : r.status === "active" ? (
                <div className="flex gap-2">
                  <AppButton size="sm" variant="ghost" label="Value" onPress={() => setValAsset(r)} />
                  <AppButton size="sm" variant="secondary" label="Dispose" onPress={() => setDisposeAsset(r)} />
                </div>
              ) : null
            }
          />
        )}
        empty={
          <EmptyState
            icon={Wallet}
            title="No personal assets yet"
            description="Record vehicles, property, or equipment. Asset purchases are cash outflows, not ordinary lifestyle expenses."
            action={<AppButton startContent={<Plus weight="bold" />} label="Add asset" onPress={() => setCreateOpen(true)} />}
          />
        }
      />

      <FormDrawer
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
        title="Add personal asset"
        submitLabel="Create asset"
        isSubmitting={createAct.isPending}
        onSubmit={createForm.handleSubmit((v) => createAct.mutate(v))}
      >
        <TextInputField control={createForm.control} name="name" label="Asset name" placeholder="e.g. Honda Civic 2019" />
        <SelectField control={createForm.control} name="asset_type" label="Asset type" options={ASSET_TYPES} />
        <NotesField control={createForm.control} name="notes" label="Notes" />
      </FormDrawer>

      <FormDrawer
        isOpen={Boolean(acquireAsset)}
        onOpenChange={(open) => { if (!open) setAcquireAsset(null); }}
        title={acquireAsset ? `Acquire — ${acquireAsset.name}` : "Acquire asset"}
        submitLabel="Confirm acquisition"
        isSubmitting={acquireAct.isPending}
        onSubmit={acquireForm.handleSubmit((v) => acquireAct.mutate(v))}
      >
        <TextInputField control={acquireForm.control} name="acquisition_date" label="Acquisition date" type="date" />
        <MoneyField control={acquireForm.control} name="cost" label="Acquisition cost" currency={currency} exponent={2} />
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input type="checkbox" {...acquireForm.register("is_opening_asset")} />
          Opening existing asset (no current cash movement)
        </label>
        {!isOpening ? (
          <SelectField control={acquireForm.control} name="money_account_id" label="Paid from account" options={accounts.options} />
        ) : null}
        <NotesField control={acquireForm.control} name="notes" label="Notes" />
      </FormDrawer>

      <FormDrawer
        isOpen={Boolean(disposeAsset)}
        onOpenChange={(open) => { if (!open) setDisposeAsset(null); }}
        title={disposeAsset ? `Dispose — ${disposeAsset.name}` : "Dispose asset"}
        submitLabel="Confirm disposal"
        isSubmitting={disposeAct.isPending}
        onSubmit={disposeForm.handleSubmit((v) => disposeAct.mutate(v))}
      >
        <TextInputField control={disposeForm.control} name="disposal_date" label="Disposal date" type="date" />
        <MoneyField control={disposeForm.control} name="proceeds" label="Proceeds" currency={currency} exponent={2} />
        <MoneyField control={disposeForm.control} name="disposal_costs" label="Disposal costs" currency={currency} exponent={2} />
        <SelectField control={disposeForm.control} name="money_account_id" label="Receiving account" options={accounts.options} />
        <TextInputField control={disposeForm.control} name="counterparty_name" label="Buyer / counterparty (optional)" />
        <NotesField control={disposeForm.control} name="notes" label="Notes" />
      </FormDrawer>

      <FormDrawer
        isOpen={Boolean(valAsset)}
        onOpenChange={(open) => { if (!open) setValAsset(null); }}
        title={valAsset ? `Manual valuation — ${valAsset.name}` : "Manual valuation"}
        description="Informational estimate only. Acquisition cost history is preserved."
        submitLabel="Save estimate"
        isSubmitting={valAct.isPending}
        onSubmit={valForm.handleSubmit((v) => valAct.mutate(v))}
      >
        <TextInputField control={valForm.control} name="valuation_date" label="As-of date" type="date" />
        <MoneyField control={valForm.control} name="value" label="Estimated value" currency={currency} exponent={2} />
        <TextInputField control={valForm.control} name="source" label="Source" placeholder="user_manual" />
        <NotesField control={valForm.control} name="notes" label="Notes" />
      </FormDrawer>
    </Page>
  );
}

export function AssetsPage() {
  return (
    <WorkspaceGate>
      {(info) => <AssetsContent {...info} />}
    </WorkspaceGate>
  );
}
