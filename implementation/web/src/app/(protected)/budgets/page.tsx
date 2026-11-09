import type { Metadata } from "next";

import { BudgetsPage } from "@/components/features/finance/budgets-page";

export const metadata: Metadata = {
  title: "Budgets — Rekordly",
  description: "Spending limits and how close you are.",
};

export default function Page() {
  return <BudgetsPage />;
}
