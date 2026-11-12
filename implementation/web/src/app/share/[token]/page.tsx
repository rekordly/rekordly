import type { Metadata } from "next";

import { GuestSharePortal } from "@/components/features/documents/guest-portal-page";

export const metadata: Metadata = {
  title: "Shared Document — Rekordly",
  robots: { index: false, follow: false },
};

export default async function PublicSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestSharePortal token={token} />;
}
