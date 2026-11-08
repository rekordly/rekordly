"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AUTH_ROUTES, resolvePostAuthDestination, sanitizeReturnToPath } from "@/lib/auth/onboarding-routes";
import { useSessionQuery } from "@/lib/auth/session-query";
import { useSessionStore } from "@/lib/auth/session-store";

export function RouteLoading() {
  return (
    <div className="flex min-h-dvh w-full bg-background" aria-label="Restoring session">
      <div className="hidden w-1/2 animate-pulse bg-primary/10 md:block" />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 animate-pulse">
          <div className="h-7 w-40 rounded-lg bg-surface-muted" />
          <div className="h-11 rounded-xl bg-surface-muted" />
          <div className="h-11 rounded-xl bg-surface-muted" />
        </div>
      </div>
    </div>
  );
}

function currentReturnTo(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return sanitizeReturnToPath(query ? `${pathname}?${query}` : pathname) ?? "/dashboard";
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = useSessionStore((state) => state.status);
  const query = useSessionQuery();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    const returnTo = currentReturnTo(pathname, searchParams);
    router.replace(`${AUTH_ROUTES.LOGIN}?return_to=${encodeURIComponent(returnTo)}`);
  }, [pathname, router, searchParams, status]);

  if (status !== "authenticated") {
    if (query.error && status !== "unauthenticated") {
      return (
        <div className="flex min-h-dvh items-center justify-center p-6 text-center">
          <div>
            <h1 className="font-heading text-xl font-semibold">Unable to restore your session</h1>
            <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
          </div>
        </div>
      );
    }
    return <RouteLoading />;
  }

  return <>{children}</>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  useSessionQuery();

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const destination = resolvePostAuthDestination(
      user.onboarding_status,
      searchParams.get("return_to"),
      user.onboarding?.current_step,
    );
    router.replace(destination);
  }, [router, searchParams, status, user]);

  if (status === "unknown" || status === "restoring" || status === "authenticated") {
    return <RouteLoading />;
  }
  return <>{children}</>;
}
