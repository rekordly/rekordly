"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { ApiClientError } from "@/lib/api/client";
import { sessionApi } from "@/lib/api/session";
import { useSessionStore } from "./session-store";

export const sessionQueryKey = ["auth", "session"] as const;

export function useSessionQuery() {
  const setRestoring = useSessionStore((state) => state.setRestoring);
  const setAuthenticated = useSessionStore((state) => state.setAuthenticated);
  const setUnauthenticated = useSessionStore((state) => state.setUnauthenticated);

  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => sessionApi.getCurrentUser(),
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiClientError && error.status === 401) return false;
      return failureCount < 1;
    },
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (query.isPending) setRestoring();
    if (query.data) setAuthenticated(query.data);
    if (query.error instanceof ApiClientError && query.error.status === 401) {
      setUnauthenticated();
    }
  }, [query.data, query.error, query.isPending, setAuthenticated, setRestoring, setUnauthenticated]);

  return query;
}
