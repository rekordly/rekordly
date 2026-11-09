"use client";

import { Toast } from "@heroui/react";
import { IconContext } from "@phosphor-icons/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";

import { SessionLifecycle } from "@/components/providers/session-provider";
import { ApiClientError } from "@/lib/errors";

function shouldRetry(failureCount: number, error: unknown) {
  // Retrying these cannot help: the answer depends on who is asking.
  if (error instanceof ApiClientError && [401, 403, 404].includes(error.status ?? 0)) {
    return false;
  }
  return failureCount < 1;
}

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: shouldRetry },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {/* Phosphor duotone is the default icon style across the app. */}
        <IconContext.Provider value={{ weight: "duotone", size: 20, color: "currentColor" }}>
          <SessionLifecycle />
          {children}
          <Toast.Provider placement="top end" />
        </IconContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
