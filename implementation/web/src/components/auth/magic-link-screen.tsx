"use client";

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AuthCard } from "@/components/ui/auth-card";
import {
  authApi,
  AUTH_ROUTES,
} from "@/lib/auth";
import {
  createSubmissionGuard,
  handleMagicLinkConfirm,
  scrubTokenFromBrowserUrl,
} from "@/stores/auth-store";

export function MagicLinkScreen({ initialToken }: { initialToken?: string | null }) {
  const router = useRouter();
  // The single-use token lives only in this component's memory.
  const [token] = useState(() => (initialToken ?? "").trim());
  const [failed, setFailed] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const guard = useRef(createSubmissionGuard());

  useEffect(() => {
    if (token) scrubTokenFromBrowserUrl(AUTH_ROUTES.MAGIC_LINK);
  }, [token]);

  const inspection = useQuery({
    queryKey: ["auth", "magic-link"],
    queryFn: async () => {
      await authApi.inspectMagicLink(token);
      return true;
    },
    enabled: token.length > 0,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
  });

  // Signing in needs this click: mail scanners open links, but they do not press buttons.
  const confirm = async () => {
    await guard.current.run(async () => {
      setIsConfirming(true);
      try {
        const outcome = await handleMagicLinkConfirm(token);
        router.replace(outcome.destination);
      } catch {
        setFailed(true);
        setIsConfirming(false);
      }
    });
  };

  if (!token || failed || inspection.isError) {
    return (
      <AuthCard
        title="Link expired or invalid"
        subtitle="Sign-in links work once and expire quickly"
        alert={
          <Alert
            status="warning"
            title="Link unavailable"
            description="This link is invalid, expired, or has already been used. Request a new one to continue."
          />
        }
      >
        <AppButton
          size="md"
          fullWidth
          startContent={<ArrowLeft />}
          label="Back to sign in"
          onPress={() => router.replace(AUTH_ROUTES.LOGIN)}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Confirm sign-in" subtitle="Continue to your Rekordly account on this device">
      <AppButton
        size="md"
        fullWidth
        isLoading={inspection.isPending || isConfirming}
        endContent={<ArrowRight weight="bold" />}
        onPress={() => void confirm()}
      >
        {inspection.isPending ? "Checking link..." : isConfirming ? "Signing in..." : "Sign in to Rekordly"}
      </AppButton>
    </AuthCard>
  );
}
