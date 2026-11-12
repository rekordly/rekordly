import type { Metadata } from "next";
import { LoansPage } from "@/components/features/personal/loans-page";

export const metadata: Metadata = {
  title: "Loans — Rekordly",
  description: "Track money borrowed and lent with principal, interest, and fee separation.",
};

export default function Page() {
  return <LoansPage />;
}
