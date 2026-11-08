import type { Metadata } from "next";

import { MagicLinkScreen } from "@/components/auth/magic-link-screen";
import { AUTH_ROUTES } from "@/lib/auth/onboarding-routes";

export const metadata: Metadata = {
  title: "Confirm sign-in link | Rekordly",
  description: "Verify and confirm your single-use Rekordly sign-in link.",
};

interface AuthMagicPageProps {
  searchParams?: Promise<{
    token?: string;
    email?: string;
  }>;
}

export default async function AuthMagicPage({ searchParams }: AuthMagicPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return (
    <MagicLinkScreen
      initialToken={resolvedParams?.token ?? null}
      initialEmail={resolvedParams?.email}
      cleanPathname={AUTH_ROUTES.AUTH_MAGIC}
    />
  );
}
