import type { Metadata } from "next";

import { AccountsPage } from "@/components/features/finance/accounts-page";

export const metadata: Metadata = {
  title: "Accounts — Rekordly",
  description: "Your money accounts and categories.",
};

export default function Page() {
  return <AccountsPage />;
}
