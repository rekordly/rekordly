import type { Metadata } from "next";

import { FinanceOverview } from "@/components/features/finance/overview";

export const metadata: Metadata = {
  title: "Dashboard — Rekordly",
  description: "Your income, expenses and cash at a glance.",
};

export default function Page() {
  return <FinanceOverview title="Dashboard" description="Your income, expenses and cash at a glance." showRecent />;
}
