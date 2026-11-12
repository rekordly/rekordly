import type { Metadata } from "next";
import { OwnerTransfersPage } from "@/components/features/personal/owner-transfers-page";

export const metadata: Metadata = {
  title: "Owner Transfers — Rekordly",
  description: "Transfer funds atomically between your Personal and owned Business workspaces.",
};

export default function Page() {
  return <OwnerTransfersPage />;
}
