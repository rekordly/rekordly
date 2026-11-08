import type { Metadata } from "next";

import { GoogleAuthScreen } from "@/components/auth/google-auth-screen";

export const metadata: Metadata = {
  title: "Continue with Google",
  description: "Sign in or link your Google account with Rekordly.",
};

interface LoginGooglePageProps {
  searchParams: Promise<{
    return_to?: string | string[];
  }>;
}

export default async function LoginGooglePage({
  searchParams,
}: LoginGooglePageProps) {
  const resolvedParams = await searchParams;
  const rawReturnTo = resolvedParams.return_to;
  const returnTo = Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo;

  return <GoogleAuthScreen mode="start" initialReturnTo={returnTo ?? null} />;
}
