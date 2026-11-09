import type { Metadata } from "next";

import { TradePage } from "@/components/features/finance/trade-page";

export const metadata: Metadata = {
  title: "New sale — Rekordly",
  description: "Record a sale.",
};

export default function Page() {
  return <TradePage kind="sale" startOpen />;
}
