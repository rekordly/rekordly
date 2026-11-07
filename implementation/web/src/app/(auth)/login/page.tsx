import type { Metadata } from "next";

import { EmailEntryScreen } from "@/components/auth/email-entry-screen";

export const metadata: Metadata = {
  title: "Sign in | Rekordly",
  description: "Sign in or create an account to continue to Rekordly.",
};

interface LoginPageProps {
  searchParams?: Promise<{
    return_to?: string;
    email?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return (
    <EmailEntryScreen
      initialReturnTo={resolvedParams?.return_to}
      initialEmail={resolvedParams?.email}
    />
  );
}
