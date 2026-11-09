import type { Metadata } from "next";

import { InvoicesPage } from "@/components/features/finance/invoices-page";

export const metadata: Metadata = {
  title: "Invoices — Rekordly",
  description: "Bills you send to customers.",
};

export default function Page() {
  return <InvoicesPage />;
}
