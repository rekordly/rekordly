import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Purchases & Vendor Bills — Rekordly",
  description: "Track procurement, supplier bills, and vendor commitments.",
};

export default function PurchasesPage() {
  return <FeatureScaffold featureId="purchases" defaultSpace="business" />;
}
