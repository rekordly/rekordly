import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Customer Deposits & Wallets — Rekordly",
  description: "Hold customer advance payments and store credit securely as liabilities.",
};

export default function WalletsPage() {
  return <FeatureScaffold featureId="customer-deposits" defaultSpace="business" />;
}
