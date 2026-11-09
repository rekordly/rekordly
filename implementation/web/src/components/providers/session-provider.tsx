"use client";

import { toast } from "@heroui/react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { setCsrfToken, setSessionLostHandler } from "@/lib/api";
import { AUTH_ROUTES, clearSessionMarker, sessionApi, setSessionMarker } from "@/lib/auth";
import { ApiClientError } from "@/lib/errors";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export const sessionQueryKey = ["auth", "session"] as const;

const KEEP_ALIVE_INTERVAL_MS = 60_000;
/** Rotate once this share of the session's lifetime is left. */
const REFRESH_WHEN_REMAINING = 0.25;
/** An unattended tab must not keep a session alive forever on a shared device. */
const IDLE_LIMIT_MS = 30 * 60_000;
const SESSION_CHANNEL = "rekordly-session";

type SessionBroadcast = "signed-out" | "refreshed";

function isSessionDead(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

/** Drop everything fetched for a user, keeping only the session query itself. */
function purgeTenantData(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionQueryKey[0] });
}

function broadcast(message: SessionBroadcast) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  channel.postMessage(message);
  channel.close();
}

/** Remove every local trace of the session, then reload so no memory state survives. */
function leaveToLogin() {
  clearSessionMarker();
  useWorkspaceStore.getState().clear();
  useAuthStore.getState().resetAuthFlow();
  window.location.replace(AUTH_ROUTES.LOGIN);
}

/**
 * End the session. If the server cannot confirm it, the user stays signed in
 * and is told, because the HttpOnly cookie would otherwise silently remain valid.
 */
export async function signOut(): Promise<void> {
  try {
    await sessionApi.logout();
  } catch (error: unknown) {
    if (!isSessionDead(error)) {
      toast.danger("Could not sign you out. Check your connection and try again.");
      return;
    }
  }
  broadcast("signed-out");
  leaveToLogin();
}

export function useSessionQuery() {
  const queryClient = useQueryClient();
  const setRestoring = useAuthStore((state) => state.setRestoring);
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated);

  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => sessionApi.getCurrentUser(),
    staleTime: 30_000,
    retry: (failureCount, error) => !isSessionDead(error) && failureCount < 1,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (isSessionDead(query.error)) {
      if (query.isFetching) {
        setRestoring();
        return;
      }
      clearSessionMarker();
      setCsrfToken(null);
      purgeTenantData(queryClient);
      setUnauthenticated();
      return;
    }
    if (query.data) {
      const previousUser = useAuthStore.getState().user;
      if (previousUser && previousUser.id !== query.data.id) {
        purgeTenantData(queryClient);
      }
      setSessionMarker(query.data.session.expires_at);
      setAuthenticated(query.data);
      return;
    }
    if (query.isFetching) setRestoring();
  }, [
    query.data,
    query.error,
    query.isFetching,
    queryClient,
    setAuthenticated,
    setRestoring,
    setUnauthenticated,
  ]);

  return query;
}

/** App-wide session upkeep: expiry, rotation, and keeping tabs in step. Mounted once. */
export function useSessionLifecycle() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const recheckSession = () => queryClient.invalidateQueries({ queryKey: sessionQueryKey });

    let warnedExpired = false;
    setSessionLostHandler(() => {
      if (!warnedExpired) {
        warnedExpired = true;
        toast.warning("Your session has expired. Please sign in again.");
      }
      void recheckSession();
    });

    const channel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(SESSION_CHANNEL);
    if (channel) {
      channel.onmessage = (event: MessageEvent<SessionBroadcast>) => {
        if (event.data === "signed-out") leaveToLogin();
        if (event.data === "refreshed") void recheckSession();
      };
    }

    // A page restored from the back/forward cache may belong to an ended session.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void recheckSession();
    };
    window.addEventListener("pageshow", onPageShow);

    let lastActiveAt = Date.now();
    const noteActivity = () => {
      lastActiveAt = Date.now();
    };
    const activityEvents = ["pointerdown", "keydown"] as const;
    activityEvents.forEach((name) =>
      window.addEventListener(name, noteActivity, { passive: true }),
    );

    const keepAlive = async () => {
      const session = useAuthStore.getState().user?.session;
      if (!session) return;
      const now = Date.now();
      const expiresAt = new Date(session.expires_at).getTime();
      const issuedAt = new Date(session.issued_at).getTime();
      if (now >= expiresAt) {
        void recheckSession();
        return;
      }
      const refreshAt = expiresAt - (expiresAt - issuedAt) * REFRESH_WHEN_REMAINING;
      if (now < refreshAt || now - lastActiveAt > IDLE_LIMIT_MS) return;

      try {
        await sessionApi.refresh();
        broadcast("refreshed");
        void recheckSession();
      } catch (error: unknown) {
        // Offline or a server error: leave the session alone and try on the next tick.
        if (isSessionDead(error)) void recheckSession();
      }
    };

    const interval = window.setInterval(() => void keepAlive(), KEEP_ALIVE_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void keepAlive();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      setSessionLostHandler(null);
      channel?.close();
      window.removeEventListener("pageshow", onPageShow);
      activityEvents.forEach((name) => window.removeEventListener(name, noteActivity));
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient]);
}

export function SessionLifecycle() {
  useSessionLifecycle();
  return null;
}
