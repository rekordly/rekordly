import type { Metadata } from "next";

import { ReportsRouter } from "@/components/features/personal/reports-router";

export const metadata: Metadata = {
  title: "Reports — Rekordly",
  description: "Income, expenses, cash movement, budgets, loans, investments, and assets.",
};

export default function Page() {
  return <ReportsRouter />;
}
