import type { Metadata } from "next";

import { TaxPage } from "@/components/features/finance/tax-page";

export const metadata: Metadata = {
  title: "Tax readiness — Rekordly",
  description: "Your VAT position, prepared for your accountant.",
};

export default function Page() {
  return <TaxPage />;
}
