import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Budgets & Spending Targets — Rekordly",
  description: "Set category spending limits and track income goals.",
};

export default function BudgetsPage() {
  return <FeatureScaffold featureId="budgets" defaultSpace="personal" />;
}
