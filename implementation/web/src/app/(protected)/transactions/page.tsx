import type { Metadata } from "next";
import { ActivityRouter } from "@/components/features/personal/activity-router";

export const metadata: Metadata = {
  title: "Activity — Rekordly",
  description: "Track income, expenses, transfers, loans, investments, and assets.",
};

export default function TransactionsPage() {
  return <ActivityRouter />;
}
