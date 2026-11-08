import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Payments & Settlements — Rekordly",
  description: "Record settlements, invoice receipts, and disbursements.",
};

export default function PaymentsPage() {
  return <FeatureScaffold featureId="payments" defaultSpace="business" />;
}
