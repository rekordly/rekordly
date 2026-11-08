import type { Metadata } from "next";

import { GoogleAuthScreen } from "@/components/auth/google-auth-screen";

export const metadata: Metadata = {
  title: "Google Sign-In Callback",
  description: "Completing Google authentication for Rekordly.",
};

interface GoogleCallbackPageProps {
  searchParams: Promise<{
    code?: string | string[];
    state?: string | string[];
    error?: string | string[];
    return_to?: string | string[];
  }>;
}

export default async function GoogleCallbackPage({
  searchParams,
}: GoogleCallbackPageProps) {
  const resolvedParams = await searchParams;
  const rawCode = resolvedParams.code;
  const rawState = resolvedParams.state;
  const rawError = resolvedParams.error;
  const rawReturnTo = resolvedParams.return_to;

  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  const state = Array.isArray(rawState) ? rawState[0] : rawState;
  const error = Array.isArray(rawError) ? rawError[0] : rawError;
  const returnTo = Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo;

  return (
    <GoogleAuthScreen
      mode="callback"
      initialCode={code ?? null}
      initialState={state ?? null}
      initialError={error ?? null}
      initialReturnTo={returnTo ?? null}
    />
  );
}
