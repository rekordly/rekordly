import type { ReactNode } from "react";

import { OnboardingRoute } from "@/components/auth/onboarding-route";
import { ProtectedRoute, RouteLoading } from "@/components/auth/route-guards";
import { ThemeToggle } from "@/components/ui";
import { Suspense } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteLoading />}>
      <ProtectedRoute>
        <OnboardingRoute>
          <main className="min-h-dvh bg-background text-foreground">
            <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
              <span className="font-heading text-xl font-bold tracking-tight text-primary">Rekordly</span>
              <ThemeToggle />
            </header>
            <div className="mx-auto max-w-5xl px-6 pb-12">{children}</div>
          </main>
        </OnboardingRoute>
      </ProtectedRoute>
    </Suspense>
  );
}
