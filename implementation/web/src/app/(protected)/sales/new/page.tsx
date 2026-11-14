import type { Metadata } from "next";

import { TradeFormPage } from "@/components/features/finance/trade-form-page";

export const metadata: Metadata = {
  title: "Record a sale — Rekordly",
  description: "What you sold, who bought it, and how they paid.",
};

export default function Page() {
  return <TradeFormPage kind="sale" />;
}
