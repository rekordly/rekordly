"use client";

import { useActiveWorkspace } from "@/stores/workspace-store";
import { FinanceOverview } from "../finance/overview";
import { PersonalReportsPage } from "./personal-reports";

export function ReportsRouter() {
  const { mode } = useActiveWorkspace();
  if (mode === "personal") {
    return <PersonalReportsPage />;
  }
  return <FinanceOverview title="Reports" description="Income, expenses and spending over time." showRecent={false} />;
}
