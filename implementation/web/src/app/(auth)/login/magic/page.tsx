import type { Metadata } from "next";

import { MagicLinkScreen } from "@/components/auth/magic-link-screen";
import { AUTH_ROUTES } from "@/lib/auth/onboarding-routes";

export const metadata: Metadata = {
  title: "Magic link sign-in | Rekordly",
  description: "Sign in to Rekordly with a single-use email link.",
};

interface LoginMagicPageProps {
  searchParams?: Promise<{
    token?: string;
    email?: string;
    requested?: string;
  }>;
}

export default async function LoginMagicPage({ searchParams }: LoginMagicPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return (
    <MagicLinkScreen
      initialToken={resolvedParams?.token ?? null}
      initialEmail={resolvedParams?.email}
      initialRequested={resolvedParams?.requested === "1"}
      cleanPathname={AUTH_ROUTES.LOGIN_MAGIC}
    />
  );
}
