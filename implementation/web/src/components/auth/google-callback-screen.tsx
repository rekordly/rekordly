"use client";

import { ArrowLeft, ArrowRight, LockKey } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AuthCard } from "@/components/ui/auth-card";
import { AUTH_ROUTES } from "@/lib/auth";
import { ApiClientError } from "@/lib/errors";
import {
  handleGoogleCallback,
  handleGoogleLinkSubmit,
  scrubTokenFromBrowserUrl,
  type GoogleCallbackOutcome,
} from "@/stores/auth-store";

type LinkState = Extract<GoogleCallbackOutcome, { kind: "link-required" }>;

export function GoogleCallbackScreen({ code, state }: { code?: string; state?: string }) {
  const router = useRouter();
  const hasRun = useRef(false);
  const [failed, setFailed] = useState(() => !code || !state);
  const [link, setLink] = useState<LinkState | null>(null);
  const [password, setPassword] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    // Google's code works once, so this must not repeat on a re-render.
    if (hasRun.current || !code || !state) return;
    hasRun.current = true;
    scrubTokenFromBrowserUrl(AUTH_ROUTES.GOOGLE_CALLBACK);
    handleGoogleCallback(code, state)
      .then((outcome) => {
        if (outcome.kind === "link-required") setLink(outcome);
        else router.replace(outcome.destination);
      })
      .catch(() => setFailed(true));
  }, [code, router, state]);

  const submitLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!link || !password) return;
    setLinkError(null);
    setIsLinking(true);
    try {
      router.replace(await handleGoogleLinkSubmit(link.linkProofToken, password, link.returnTo));
    } catch (error: unknown) {
      setLinkError(error instanceof ApiClientError ? error.message : "Unable to link Google right now. Please try again.");
      setIsLinking(false);
    }
  };

  if (failed) {
    return (
      <AuthCard
        title="Google sign-in failed"
        subtitle="We could not complete that sign-in"
        alert={<Alert status="warning" title="Please try again" description="The sign-in was cancelled or has expired." />}
      >
        <AppButton fullWidth startContent={<ArrowLeft />} label="Back to sign in" onPress={() => router.replace(AUTH_ROUTES.LOGIN)} />
      </AuthCard>
    );
  }

  if (link) {
    return (
      <AuthCard
        title="Link your Google account"
        subtitle="This email already has a Rekordly account. Enter its password to connect Google."
        alert={linkError ? <Alert status="error" title="Could not link" description={linkError} onDismiss={() => setLinkError(null)} /> : null}
      >
        <form onSubmit={(event) => void submitLink(event)} noValidate className="flex flex-col gap-4">
          <AppInput
            type="password"
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your password"
            startContent={<LockKey />}
            isRequired
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <AppButton type="submit" fullWidth isLoading={isLinking} isDisabled={!password} endContent={<ArrowRight weight="bold" />}>
            {isLinking ? "Linking..." : "Link and continue"}
          </AppButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Signing you in" subtitle="Completing your Google sign-in">
      <div className="h-10 animate-pulse rounded-full bg-default" aria-label="Signing in" />
    </AuthCard>
  );
}
