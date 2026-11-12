import type { Metadata } from "next";
import { AssetsPage } from "@/components/features/personal/assets-page";

export const metadata: Metadata = {
  title: "Personal Assets — Rekordly",
  description: "Track vehicles, property, equipment, manual valuations, and disposals.",
};

export default function Page() {
  return <AssetsPage />;
}
