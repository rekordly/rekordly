import { Suspense, type ReactNode } from "react";

import { ProtectedRoute, RouteLoading } from "@/components/auth/route-guards";
import { AppShell } from "@/components/layout/app-shell";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteLoading />}>
      <ProtectedRoute>
        <AppShell>{children}</AppShell>
      </ProtectedRoute>
    </Suspense>
  );
}
