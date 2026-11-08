import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Transactions — Rekordly",
  description: "Track income, expenses, and transfers across Personal and Business spaces.",
};

export default function TransactionsPage() {
  return <FeatureScaffold featureId="income-expenses" defaultSpace="business" />;
}
