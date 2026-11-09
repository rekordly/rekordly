"use client";

import { ArrowClockwise, WifiSlash } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AUTH_ROUTES, resolvePostAuthDestination, sanitizeReturnToPath } from "@/lib/auth";
import { useSessionQuery } from "@/components/providers/session-provider";
import { useAuthStore } from "@/stores/auth-store";

export function RouteLoading() {
  return (
    <div className="flex min-h-dvh w-full bg-background" aria-label="Restoring session">
      <div className="hidden w-1/2 animate-pulse bg-brand-panel md:block" />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 animate-pulse">
          <div className="h-7 w-40 rounded-lg bg-default" />
          <div className="h-11 rounded-xl bg-default" />
          <div className="h-11 rounded-xl bg-default" />
        </div>
      </div>
    </div>
  );
}

/** Same frame as the signed-in app, so restoring a session does not shift the layout. */
export function ShellLoading() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background" aria-label="Restoring session">
      <div className="hidden w-[264px] shrink-0 animate-pulse flex-col space-y-4 bg-sidebar p-4 md:flex">
        <div className="mb-6 h-8 w-32 rounded-xl bg-sidebar-hover" />
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-9 w-full rounded-xl bg-sidebar-hover" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[72px] animate-pulse items-center justify-between border-b border-border/40 bg-surface px-6">
          <div className="h-6 w-48 rounded-lg bg-default" />
          <div className="size-8 rounded-full bg-default" />
        </div>
        <div className="flex-1 animate-pulse space-y-6 p-6">
          <div className="h-8 w-64 rounded-xl bg-default" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 rounded-3xl bg-default" />
            ))}
          </div>
          <div className="h-80 rounded-3xl bg-default" />
        </div>
      </div>
    </div>
  );
}

function currentReturnTo(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return sanitizeReturnToPath(query ? `${pathname}?${query}` : pathname) ?? "/dashboard";
}

function SessionUnavailable({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center">
        <WifiSlash size={40} className="mx-auto mb-4 text-danger" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-foreground">Can&apos;t reach Rekordly</h1>
        <p className="mt-2 text-sm text-muted">Check your connection, then try again.</p>
        <div className="mt-6 flex justify-center">
          <AppButton
            label="Try again"
            isLoading={isRetrying}
            startContent={<ArrowClockwise />}
            onPress={onRetry}
          />
        </div>
      </div>
    </div>
  );
}

export function ProtectedRoute({
  children,
  fallback = <RouteLoading />,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = useAuthStore((state) => state.status);
  const query = useSessionQuery();

  useEffect(() => {
    // Wait for the check in flight: this status may be left over from before sign-in.
    if (status !== "unauthenticated" || query.isFetching) return;
    const returnTo = currentReturnTo(pathname, searchParams);
    router.replace(`${AUTH_ROUTES.LOGIN}?return_to=${encodeURIComponent(returnTo)}`);
  }, [pathname, query.isFetching, router, searchParams, status]);

  if (status !== "authenticated") {
    if (query.error && status !== "unauthenticated") {
      return <SessionUnavailable onRetry={() => void query.refetch()} isRetrying={query.isFetching} />;
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
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
