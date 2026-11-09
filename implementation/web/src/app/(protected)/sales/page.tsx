import type { Metadata } from "next";

import { TradePage } from "@/components/features/finance/trade-page";

export const metadata: Metadata = {
  title: "Sales — Rekordly",
  description: "What you have sold.",
};

export default function Page() {
  return <TradePage kind="sale" />;
}
