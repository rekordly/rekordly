import type { Metadata } from "next";

import { WalletsPage } from "@/components/features/finance/wallets-page";

export const metadata: Metadata = {
  title: "Customer wallets — Rekordly",
  description: "Advance payments held for customers.",
};

export default function Page() {
  return <WalletsPage />;
}
