import type { Metadata } from "next";
import { InvestmentsPage } from "@/components/features/personal/investments-page";

export const metadata: Metadata = {
  title: "Investments — Rekordly",
  description: "Manual investment tracking with cost basis, income, and manual valuation snapshots.",
};

export default function Page() {
  return <InvestmentsPage />;
}
