import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Sales & Orders — Rekordly",
  description: "Record customer sales, manage orders, and track revenue.",
};

export default function SalesPage() {
  return <FeatureScaffold featureId="sales" defaultSpace="business" />;
}
