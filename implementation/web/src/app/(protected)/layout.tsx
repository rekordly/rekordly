import { Suspense, type ReactNode } from "react";

import { ProtectedRoute, ShellLoading } from "@/components/auth/route-guards";
import { AppShell } from "@/components/layout/app-shell";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellLoading />}>
      <ProtectedRoute fallback={<ShellLoading />}>
        <AppShell>{children}</AppShell>
      </ProtectedRoute>
    </Suspense>
  );
}
