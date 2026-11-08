import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Loans & Debt Tracker — Rekordly",
  description: "Track money borrowed and lent without complex amortization formulas.",
};

export default function LoansPage() {
  return <FeatureScaffold featureId="loans" defaultSpace="personal" />;
}
