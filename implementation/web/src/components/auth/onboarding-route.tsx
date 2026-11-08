"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { RouteLoading } from "./route-guards";
import { useSessionQuery } from "@/lib/auth/session-query";
import { isOnboardingComplete } from "@/lib/auth/onboarding-routes";
import { useSessionStore } from "@/lib/auth/session-store";

export function OnboardingRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  const query = useSessionQuery();

  useEffect(() => {
    if (status === "authenticated" && user && isOnboardingComplete(user.onboarding_status)) {
      router.replace("/dashboard");
    }
  }, [router, status, user]);

  if (status !== "authenticated" || !user || query.isPending) return <RouteLoading />;
  return <>{children}</>;
}
