import type { Metadata } from "next";

import { Dashboard } from "@/components/features/finance/dashboard";

export const metadata: Metadata = {
  title: "Dashboard — Rekordly",
  description: "Your cash, results and what is still unpaid, at a glance.",
};

export default function Page() {
  return <Dashboard />;
}
