import type { Metadata } from "next";
import { TransactionList } from "@/components/features/transaction-list";

export const metadata: Metadata = {
  title: "Transactions — Rekordly",
  description: "Track income, expenses, and transfers across Personal and Business spaces.",
};

export default function TransactionsPage() {
  return <TransactionList />;
}
