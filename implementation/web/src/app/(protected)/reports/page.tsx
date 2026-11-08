import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Reports & Financial Statements — Rekordly",
  description: "View financial summaries, cash flows, and export statements.",
};

export default function ReportsPage() {
  return <FeatureScaffold featureId="reports-tax" defaultSpace="business" />;
}
