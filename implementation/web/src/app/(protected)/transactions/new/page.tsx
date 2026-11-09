import type { Metadata } from "next";

import { TransactionList } from "@/components/features/transaction-list";

export const metadata: Metadata = {
  title: "Record money — Rekordly",
  description: "Record income, expenses and transfers.",
};

const DIRECTIONS = { income: "money_in", expense: "money_out", transfer: "transfer" } as const;

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const initialDirection = type && type in DIRECTIONS ? DIRECTIONS[type as keyof typeof DIRECTIONS] : undefined;
  return <TransactionList startOpen initialDirection={initialDirection} />;
}
