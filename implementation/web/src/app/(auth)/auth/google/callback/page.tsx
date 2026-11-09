import type { Metadata } from "next";

import { GoogleCallbackScreen } from "@/components/auth/google-callback-screen";

export const metadata: Metadata = {
  title: "Signing in with Google | Rekordly",
  description: "Completing your Google sign-in.",
};

export default async function GoogleCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}) {
  const { code, state, error } = await searchParams;
  return <GoogleCallbackScreen code={error ? undefined : code} state={state} />;
}
