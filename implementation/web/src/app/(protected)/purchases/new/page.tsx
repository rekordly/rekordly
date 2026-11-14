import type { Metadata } from "next";

import { TradeFormPage } from "@/components/features/finance/trade-form-page";

export const metadata: Metadata = {
  title: "Record a purchase — Rekordly",
  description: "What you bought, from whom, and how you paid.",
};

export default function Page() {
  return <TradeFormPage kind="purchase" />;
}
