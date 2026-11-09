import type { Metadata } from "next";

import { FinanceOverview } from "@/components/features/finance/overview";

export const metadata: Metadata = {
  title: "Reports — Rekordly",
  description: "Income, expenses and spending over time.",
};

export default function Page() {
  return <FinanceOverview title="Reports" description="Income, expenses and spending over time." showRecent={false} />;
}
