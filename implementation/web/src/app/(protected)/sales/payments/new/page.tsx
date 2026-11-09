import type { Metadata } from "next";

import { PaymentsPage } from "@/components/features/finance/payments-page";

export const metadata: Metadata = {
  title: "Record payment — Rekordly",
  description: "Record a customer payment.",
};

export default function Page() {
  return <PaymentsPage startOpen />;
}
