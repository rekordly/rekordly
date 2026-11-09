"use client";

import { ShieldWarning } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button, SurfaceCard } from "@/components/ui";
import { useSessionStore } from "@/stores/auth-store";

interface PermissionProps {
  permission: string | readonly string[];
  matchAll?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

export function usePermission(permission: string | readonly string[], matchAll = false) {
  return useSessionStore((state) => state.hasPermission(permission, matchAll));
}

export function Can({ permission, matchAll = false, children, fallback = null }: PermissionProps) {
  return usePermission(permission, matchAll) ? <>{children}</> : <>{fallback}</>;
}

export function AccessDenied() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <SurfaceCard className="max-w-md items-center text-center shadow-none">
        <div className="grid size-12 place-items-center rounded-xl bg-danger-soft text-danger">
          <ShieldWarning size={24} weight="duotone" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wider text-danger uppercase">403</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold">Permission required</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            You do not have permission to view this page. Ask a workspace owner or administrator for access.
          </p>
        </div>
        <Link href="/dashboard">
          <Button variant="primary">Return to dashboard</Button>
        </Link>
      </SurfaceCard>
    </main>
  );
}

export function PermissionGuard({ permission, matchAll = false, children }: PermissionProps) {
  return usePermission(permission, matchAll) ? <>{children}</> : <AccessDenied />;
}
