"use client";

import { ArrowLeft, ShieldWarning } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import {
  hasWorkspacePermission,
  useActiveWorkspace,
} from "@/stores/workspace-store";
import type { Permission } from "@/types/auth";

interface PermissionProps {
  permission: Permission | readonly Permission[];
  /** When true every listed permission is required; otherwise any one is enough. */
  matchAll?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

/** Whether the user may do this in the workspace currently in view. UI only; the API enforces. */
export function usePermission(permission: Permission | readonly Permission[], matchAll = false) {
  const scope = useActiveWorkspace();
  return hasWorkspacePermission(scope, permission, matchAll);
}

export function Can({ permission, matchAll = false, children, fallback = null }: PermissionProps) {
  return usePermission(permission, matchAll) ? <>{children}</> : <>{fallback}</>;
}

export function AccessDenied() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <DashboardCard className="w-full max-w-md items-center p-8 text-center sm:p-10">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger">
          <ShieldWarning size={32} aria-hidden="true" />
        </div>
        <p className="mt-5 text-xs font-semibold tracking-wider text-danger uppercase">403</p>
        <h1 className="mt-1 text-[22px] font-bold text-foreground">Permission required</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          You do not have permission to view this page in this workspace. Ask a workspace owner or
          administrator for access.
        </p>
        <Link href="/dashboard" className="mt-8">
          <AppButton variant="tertiary" startContent={<ArrowLeft weight="bold" />} label="Return to dashboard" />
        </Link>
      </DashboardCard>
    </div>
  );
}

export function PermissionGuard({ permission, matchAll = false, children }: PermissionProps) {
  return usePermission(permission, matchAll) ? <>{children}</> : <AccessDenied />;
}
