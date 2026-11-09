import type { Metadata } from "next";

import { PaymentsPage } from "@/components/features/finance/payments-page";

export const metadata: Metadata = {
  title: "Payments — Rekordly",
  description: "Money received and paid.",
};

export default function Page() {
  return <PaymentsPage />;
}
