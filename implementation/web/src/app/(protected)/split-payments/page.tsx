import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Split Payments — Rekordly",
  description: "Settle single transactions using multiple payment tenders.",
};

export default function SplitPaymentsPage() {
  return <FeatureScaffold featureId="split-payments" defaultSpace="business" />;
}
