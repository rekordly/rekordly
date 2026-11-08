import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Invoices & Estimates — Rekordly",
  description: "Create branded customer invoices, proformas, and track receivables.",
};

export default function InvoicesPage() {
  return <FeatureScaffold featureId="invoices" defaultSpace="business" />;
}
