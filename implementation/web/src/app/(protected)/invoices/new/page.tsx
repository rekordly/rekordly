import type { Metadata } from "next";

import { InvoicesPage } from "@/components/features/finance/invoices-page";

export const metadata: Metadata = {
  title: "New invoice — Rekordly",
  description: "Create an invoice.",
};

export default function Page() {
  return <InvoicesPage startOpen />;
}
