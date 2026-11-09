import type { Metadata } from "next";

import { MagicLinkScreen } from "@/components/auth/magic-link-screen";

export const metadata: Metadata = {
  title: "Confirm sign-in | Rekordly",
  description: "Confirm your Rekordly sign-in link.",
};

interface MagicLinkPageProps {
  searchParams?: Promise<{
    token?: string;
  }>;
}

export default async function MagicLinkPage({ searchParams }: MagicLinkPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return <MagicLinkScreen initialToken={resolvedParams?.token} />;
}
