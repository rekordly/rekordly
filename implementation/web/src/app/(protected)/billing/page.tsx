import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Plan Limits & Billing — Rekordly",
  description: "Track monthly quota utilization, AI credits, and plan entitlements.",
};

export default function BillingPage() {
  return <FeatureScaffold featureId="plan-limits" defaultSpace="business" />;
}
