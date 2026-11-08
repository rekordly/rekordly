import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Tax Readiness Reports — Rekordly",
  description: "Generate VAT schedules, taxable turnover, and deductible expenses for your accountant.",
};

export default function TaxReportsPage() {
  return <FeatureScaffold featureId="reports-tax" defaultSpace="business" />;
}
