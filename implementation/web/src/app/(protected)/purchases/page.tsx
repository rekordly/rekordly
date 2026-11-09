import type { Metadata } from "next";

import { TradePage } from "@/components/features/finance/trade-page";

export const metadata: Metadata = {
  title: "Purchases — Rekordly",
  description: "What you have bought.",
};

export default function Page() {
  return <TradePage kind="purchase" />;
}
