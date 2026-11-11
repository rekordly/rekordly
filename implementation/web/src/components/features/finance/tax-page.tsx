"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownLeft, ArrowUpRight, GearSix, Percent, Scales } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Page, PageHeader, Segmented } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { taxSettingsSchema, type TaxSettingsValues } from "@/lib/schemas/finance.schemas";

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
  const [range, setRange] = useState<Range>("month");
  const [isOpen, setIsOpen] = useState(false);
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
            <AppButton variant="tertiary" startContent={<GearSix />} label="Tax settings" onPress={() => setIsOpen(true)} />
          </>
        }
      />

      {report.isError ? <Alert status="error" description="Unable to load the tax report for this workspace." /> : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard tag="Taxable sales" tone="success" gradient compact isLoading={report.isPending} title={show(data?.output_vat.taxable_sales_minor)} description={`${data?.output_vat.total_count ?? 0} records`} icon={<ArrowDownLeft size={22} />} />
        <StatCard tag="Output VAT" tone="primary" gradient compact isLoading={report.isPending} title={show(data?.output_vat.output_vat_minor)} description="Charged on sales" icon={<Percent size={22} />} />
        <StatCard tag="Input VAT" tone="secondary" gradient compact isLoading={report.isPending} title={show(data?.input_vat.input_vat_minor)} description={`${data?.input_vat.purchases_count ?? 0} purchases`} icon={<ArrowUpRight size={22} />} />
        <StatCard tag="Net VAT" tone={netStatus === "payable" ? "danger" : "success"} gradient compact isLoading={report.isPending} title={show(data?.net_vat.net_vat_payable_minor)} description={netDescription} icon={<Scales size={22} />} />
      </div>

      <Alert
        status="info"
        title="Not a tax filing"
        description="These figures come from your records. Review them with your accountant before you file."
      />

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
    </Page>
  );
}

export function TaxPage() {
  return <WorkspaceGate>{(workspace) => <TaxContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>;
}
