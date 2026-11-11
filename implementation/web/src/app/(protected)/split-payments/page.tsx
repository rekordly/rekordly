import type { Metadata } from "next";
import { SplitPaymentsPage } from "@/components/features/finance/split-payments-page";

export const metadata: Metadata = {
  title: "Split Payments — Rekordly",
  description: "Settle single transactions using multiple payment tenders.",
};

export default function SplitPaymentsRoute() {
  return <SplitPaymentsPage />;
}
