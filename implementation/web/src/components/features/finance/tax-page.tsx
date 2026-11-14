"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@heroui/react";
import { ArrowDownLeft, ArrowUpRight, GearSix, Percent, Plus, Receipt, Scales } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { KpiCard } from "@/components/ui/cards";
import { KpiRow } from "./dashboard-parts";
import { ledgerApi, ledgerKeys } from "@/lib/ledger";
import { financeApi, formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions-catalog";
import { taxSettingsSchema, type TaxSettingsValues } from "@/lib/schemas/finance.schemas";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { TaxCode, TaxScheduleItem } from "@/types/ledger";

import { SelectField, TextInputField } from "./fields";
import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

const RANGES = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
] as const;

type Range = (typeof RANGES)[number]["key"];

const REGISTERED_OPTIONS = [
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
];

const TAX_TYPE_OPTIONS = [
  { key: "vat", label: "VAT" },
  { key: "wht", label: "WHT" },
  { key: "other", label: "Other" },
];

const CLASSIFICATION_OPTIONS = [
  { key: "taxable", label: "Taxable" },
  { key: "zero_rated", label: "Zero-rated" },
  { key: "exempt", label: "Exempt" },
  { key: "out_of_scope", label: "Out of scope" },
];

const taxCodeSchema = z.object({
  code: z.string().min(2, "Enter a code"),
  name: z.string().min(2, "Enter a name"),
  tax_type: z.enum(["vat", "wht", "other"]),
  classification: z.enum(["taxable", "zero_rated", "exempt", "out_of_scope"]),
  rate_percent: z.string().min(1, "Enter rate %"),
});

const taxPaymentSchema = z.object({
  tax_type: z.enum(["vat", "wht"]),
  money_account_id: z.string().min(1, "Select an account"),
  amount: z.string().min(1, "Enter payment amount"),
  payment_date: z.string().min(10, "Enter date"),
  reference: z.string().optional(),
});

function rangeStart(range: Range): Date {
  const now = new Date();
  if (range === "month") return startOfMonth(now);
  return range === "quarter" ? startOfQuarter(now) : startOfYear(now);
}

/** "7.5" → 750. A rate, not money, and it has at most two decimals. */
function percentToBasisPoints(percent: string): number {
  const [whole = "0", fraction = ""] = percent.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function basisPointsToPercent(basisPoints: number): string {
  return String(basisPoints / 100);
}

function TaxContent({ workspaceId, currency, isBusiness }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const canViewTax =
    hasWorkspacePermission(scope, PERMISSIONS.REPORTS_VIEW_TAX) || hasWorkspacePermission(scope, PERMISSIONS.REPORTS_VIEW_BASIC);
  const canManageTax = hasWorkspacePermission(scope, PERMISSIONS.CHART_MANAGE);
  const queryClient = useQueryClient();

  const [range, setRange] = useState<Range>("month");
  const [isOpen, setIsOpen] = useState(false);
  const [codeDrawerOpen, setCodeDrawerOpen] = useState(false);
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const fromDate = format(rangeStart(range), "yyyy-MM-dd");
  const toDate = format(new Date(), "yyyy-MM-dd");

  const report = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "tax-report", fromDate, toDate],
    queryFn: () => financeApi.taxReport(workspaceId, { from_date: fromDate, to_date: toDate, scope: isBusiness ? "business" : "personal" }),
  });
  const settings = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "tax-settings"],
    queryFn: () => financeApi.taxSettings(workspaceId),
  });
  const taxCodes = useQuery({
    queryKey: ledgerKeys.taxCodes(workspaceId),
    queryFn: () => ledgerApi.listTaxCodes(workspaceId),
    enabled: canViewTax,
  });
  const taxSchedules = useQuery({
    queryKey: ledgerKeys.taxSchedules(workspaceId),
    queryFn: () => ledgerApi.listTaxSchedules(workspaceId),
    enabled: canViewTax,
  });
  const accounts = useQuery({
    queryKey: moneyKeys.accounts(workspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId }),
    enabled: paymentDrawerOpen,
  });

  const codeForm = useForm<z.infer<typeof taxCodeSchema>>({
    resolver: zodResolver(taxCodeSchema),
    defaultValues: { code: "", name: "", tax_type: "vat", classification: "taxable", rate_percent: "7.5" },
  });
  const paymentForm = useForm<z.infer<typeof taxPaymentSchema>>({
    resolver: zodResolver(taxPaymentSchema),
    defaultValues: {
      tax_type: "vat",
      money_account_id: "",
      amount: "",
      payment_date: format(new Date(), "yyyy-MM-dd"),
      reference: "",
    },
  });

  const createCode = useMutation({
    mutationFn: (values: z.infer<typeof taxCodeSchema>) =>
      ledgerApi.createTaxCode(workspaceId, {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        tax_type: values.tax_type,
        classification: values.classification,
        rate_bps: percentToBasisPoints(values.rate_percent),
      }),
    onSuccess: () => {
      toast.success("Tax code created");
      setCodeDrawerOpen(false);
      codeForm.reset();
      void queryClient.invalidateQueries({ queryKey: ledgerKeys.taxCodes(workspaceId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to create tax code"),
  });

  const recordPayment = useMutation({
    mutationFn: (values: z.infer<typeof taxPaymentSchema>) =>
      ledgerApi.recordTaxPayment(
        workspaceId,
        {
          tax_type: values.tax_type,
          money_account_id: Number(values.money_account_id),
          amount: values.amount,
          currency,
          payment_date: values.payment_date,
          reference: values.reference || undefined,
        },
        `tax-pay-${workspaceId}-${Date.now()}`,
      ),
    onSuccess: () => {
      toast.success("Tax payment recorded and posted to ledger");
      setPaymentDrawerOpen(false);
      paymentForm.reset();
      void queryClient.invalidateQueries({ queryKey: ledgerKeys.taxSchedules(workspaceId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to record tax payment"),
  });

  const form = useForm<TaxSettingsValues>({
    resolver: zodResolver(taxSettingsSchema),
    defaultValues: { tax_identification_number: "", vat_rate: "7.5", is_vat_registered: "no" },
  });
  const { reset } = form;
  useEffect(() => {
    if (!settings.data) return;
    reset({
      tax_identification_number: settings.data.tax_identification_number ?? "",
      vat_rate: basisPointsToPercent(settings.data.default_vat_rate_basis_points),
      is_vat_registered: settings.data.is_vat_registered ? "yes" : "no",
    });
  }, [reset, settings.data]);

  const save = useFinanceAction(
    workspaceId,
    (values: TaxSettingsValues) =>
      financeApi.updateTaxSettings(workspaceId, {
        tax_identification_number: values.tax_identification_number,
        default_vat_rate_basis_points: percentToBasisPoints(values.vat_rate),
        is_vat_registered: values.is_vat_registered === "yes",
      }),
    { success: "Tax settings saved", onDone: () => setIsOpen(false) },
  );

  const data = report.data;
  const show = (value?: string | number) => formatMinorAmount(value ?? "0", data?.currency ?? currency, 2);
  const netStatus = data?.net_vat.status;
  const netDescription = netStatus === "payable" ? "You owe this VAT" : netStatus === "refundable" ? "VAT you can reclaim" : "Input and output VAT match";

  return (
    <Page>
      <PageHeader
        title="Tax readiness"
        description="Your VAT position, prepared for your accountant."
        actions={
          <>
            <Segmented size="sm" aria-label="Period" options={RANGES} value={range} onChange={setRange} />
            {canManageTax ? (
              <AppButton variant="tertiary" startContent={<Plus />} label="New tax code" onPress={() => setCodeDrawerOpen(true)} />
            ) : null}
            {canManageTax ? (
              <AppButton variant="primary" startContent={<Receipt />} label="Record tax payment" onPress={() => setPaymentDrawerOpen(true)} />
            ) : null}
            <AppButton variant="tertiary" startContent={<GearSix />} label="Tax settings" onPress={() => setIsOpen(true)} />
          </>
        }
      />

      {report.isError ? <Alert status="error" description="Unable to load the tax report for this workspace." /> : null}

      <KpiRow className="lg:grid-cols-4">
        <KpiCard loading={report.isPending} icon={ArrowDownLeft} label="Taxable sales" value={show(data?.output_vat.taxable_sales_minor)} hint={`${data?.output_vat.total_count ?? 0} records`} />
        <KpiCard loading={report.isPending} icon={Percent} label="Output VAT" value={show(data?.output_vat.output_vat_minor)} hint="Charged on sales" />
        <KpiCard loading={report.isPending} icon={ArrowUpRight} label="Input VAT" value={show(data?.input_vat.input_vat_minor)} hint={`${data?.input_vat.purchases_count ?? 0} purchases`} />
        <KpiCard loading={report.isPending} tone="accent" icon={Scales} label="Net VAT" value={show(data?.net_vat.net_vat_payable_minor)} hint={netDescription} />
      </KpiRow>

      <Alert
        status="info"
        title="Not a tax filing"
        description="These figures come from your records. Review them with your accountant before you file."
      />

      {canViewTax ? (
        <DataView<TaxCode>
          title="Tax codes"
          rows={taxCodes.data ?? []}
          rowKey={(row) => String(row.id)}
          isLoading={taxCodes.isPending}
          isError={taxCodes.isError}
          columns={[
            { key: "code", label: "Code", render: (row) => <span className="font-mono text-xs">{row.code}</span> },
            { key: "name", label: "Name", render: (row) => row.name },
            { key: "type", label: "Type", render: (row) => <StatusPill tone="neutral">{row.tax_type.toUpperCase()}</StatusPill> },
            { key: "class", label: "Classification", render: (row) => row.classification.replaceAll("_", " ") },
            { key: "rate", label: "Rate", align: "right", render: (row) => `${basisPointsToPercent(row.rate_bps)}%` },
          ]}
          renderCard={(row) => (
            <RecordCard
              icon={<Percent size={18} />}
              title={`${row.code} · ${row.name}`}
              reference={`${row.tax_type.toUpperCase()} (${row.classification.replaceAll("_", " ")})`}
              amount={`${basisPointsToPercent(row.rate_bps)}%`}
            />
          )}
          empty={
            <EmptyState
              icon={Percent}
              title="No tax codes configured"
              description="Add VAT or WHT codes to classify taxable, zero-rated, or exempt transactions."
            />
          }
        />
      ) : null}

      {canViewTax ? (
        <DataView<TaxScheduleItem>
          title="VAT & WHT schedule items"
          rows={taxSchedules.data ?? []}
          rowKey={(row) => String(row.id)}
          isLoading={taxSchedules.isPending}
          isError={taxSchedules.isError}
          columns={[
            { key: "date", label: "Date", render: (row) => row.effective_date },
            { key: "type", label: "Tax", render: (row) => <StatusPill tone="neutral">{row.tax_type.toUpperCase()}</StatusPill> },
            { key: "dir", label: "Direction", render: (row) => row.direction },
            { key: "cp", label: "Counterparty", render: (row) => row.counterparty_name ?? `${row.source_type} #${row.source_id}` },
            { key: "base", label: "Taxable base", align: "right", render: (row) => show(row.taxable_base_minor) },
            { key: "tax", label: "Tax amount", align: "right", render: (row) => show(row.tax_amount_minor) },
          ]}
          renderCard={(row) => (
            <RecordCard
              icon={<Receipt size={18} />}
              title={row.counterparty_name ?? `${row.source_type} #${row.source_id}`}
              reference={`${row.effective_date} · ${row.tax_type.toUpperCase()} (${row.direction})`}
              amount={show(row.tax_amount_minor)}
            />
          )}
          empty={
            <EmptyState
              icon={Receipt}
              title="No tax schedule items yet"
              description="Confirmed invoices, bills, and tax payments will appear here."
            />
          }
        />
      ) : null}

      <FormDrawer
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Tax settings"
        submitLabel="Save settings"
        isSubmitting={save.isPending}
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <TextInputField control={form.control} name="tax_identification_number" label="Tax identification number" placeholder="Optional" />
        <TextInputField control={form.control} name="vat_rate" label="Default VAT rate (%)" isRequired />
        <SelectField control={form.control} name="is_vat_registered" label="VAT registered" options={REGISTERED_OPTIONS} isRequired />
      </FormDrawer>

      <FormDrawer
        isOpen={codeDrawerOpen}
        onOpenChange={setCodeDrawerOpen}
        title="Create tax code"
        submitLabel="Create tax code"
        isSubmitting={createCode.isPending}
        onSubmit={codeForm.handleSubmit((values) => createCode.mutate(values))}
      >
        <TextInputField control={codeForm.control} name="code" label="Code" placeholder="VAT-75" isRequired />
        <TextInputField control={codeForm.control} name="name" label="Name" placeholder="Standard VAT 7.5%" isRequired />
        <SelectField control={codeForm.control} name="tax_type" label="Tax type" options={TAX_TYPE_OPTIONS} isRequired />
        <SelectField control={codeForm.control} name="classification" label="Classification" options={CLASSIFICATION_OPTIONS} isRequired />
        <TextInputField control={codeForm.control} name="rate_percent" label="Rate (%)" placeholder="7.5" isRequired />
      </FormDrawer>

      <FormDrawer
        isOpen={paymentDrawerOpen}
        onOpenChange={setPaymentDrawerOpen}
        title="Record tax payment"
        submitLabel="Record & post payment"
        isSubmitting={recordPayment.isPending}
        onSubmit={paymentForm.handleSubmit((values) => recordPayment.mutate(values))}
      >
        <SelectField
          control={paymentForm.control}
          name="tax_type"
          label="Tax type"
          options={TAX_TYPE_OPTIONS.filter((o) => o.key !== "other")}
          isRequired
        />
        <SelectField
          control={paymentForm.control}
          name="money_account_id"
          label="Paid from account"
          options={(accounts.data ?? []).map((a) => ({ key: String(a.id), label: `${a.name} (${a.currency})` }))}
          isRequired
        />
        <TextInputField control={paymentForm.control} name="amount" label={`Amount (${currency})`} placeholder="0.00" isRequired />
        <TextInputField control={paymentForm.control} name="payment_date" label="Payment date (YYYY-MM-DD)" isRequired />
        <TextInputField control={paymentForm.control} name="reference" label="Reference / receipt #" placeholder="Optional" />
      </FormDrawer>
    </Page>
  );
}

export function TaxPage() {
  return <WorkspaceGate>{(workspace) => <TaxContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>;
}
