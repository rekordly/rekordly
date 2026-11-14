"use client";

// /dashboard: picks the right home for the workspace in view.
// Business and Personal get card dashboards; "All spaces" keeps the owner summary.

import { format, startOfMonth, subMonths } from "date-fns";
import { useState } from "react";

import { Page, PageHeader, Segmented } from "@/components/ui/page";
import { useActiveWorkspace } from "@/stores/workspace-store";

import { AllOwnerSummaryView } from "../personal/personal-home";
import { PersonalDashboard } from "../personal/personal-dashboard";
import { BusinessDashboard } from "./business-dashboard";
import { PeriodSelect, type DashboardPeriod } from "./dashboard-parts";

export function Dashboard() {
  const { mode, inScope } = useActiveWorkspace();
  const [period, setPeriod] = useState<DashboardPeriod>("1");
  const [shownId, setShownId] = useState("");
  const shown = inScope.find((workspace) => String(workspace.id) === shownId) ?? inScope[0];

  if (mode === "all") {
    const fromDate = format(startOfMonth(subMonths(new Date(), Number(period) - 1)), "yyyy-MM-dd");
    const toDate = format(new Date(), "yyyy-MM-dd");
    return (
      <Page>
        <PageHeader title="All spaces summary" description="Cash and activity across your spaces." actions={<PeriodSelect value={period} onChange={setPeriod} />} />
        {inScope[0] ? <AllOwnerSummaryView anchorWorkspaceId={inScope[0].id} fromDate={fromDate} toDate={toDate} /> : null}
      </Page>
    );
  }

  if (!shown) return null;

  return (
    <div className="space-y-4">
      {inScope.length > 1 ? (
        <Segmented
          aria-label="Space"
          options={inScope.map((workspace) => ({ key: String(workspace.id), label: workspace.name }))}
          value={String(shown.id)}
          onChange={setShownId}
        />
      ) : null}
      {shown.kind === "personal" ? (
        <PersonalDashboard key={shown.id} workspace={shown} period={period} onPeriodChange={setPeriod} />
      ) : (
        <BusinessDashboard key={shown.id} workspace={shown} period={period} onPeriodChange={setPeriod} />
      )}
    </div>
  );
}
