"use client";

import { ArrowRight, CircleNotch } from "@phosphor-icons/react";
import Link from "next/link";

import { PermissionGuard } from "@/components/auth/can";
import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";

export function ModulePlaceholder({
  title,
  description,
  permission,
  actionLabel = "Add record",
  actionHref = "/dashboard",
}: {
  title: string;
  description: string;
  permission?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  const content = (
    <Page>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Link href={actionHref}>
            <AppButton endContent={<ArrowRight />} label={actionLabel} />
          </Link>
        }
      />
      <DashboardCard className="p-0">
        <EmptyState
          icon={CircleNotch}
          title={`Your ${title.toLowerCase()} will appear here.`}
          description="The shell and permissions are ready for this module."
        />
      </DashboardCard>
    </Page>
  );
  return permission ? <PermissionGuard permission={permission}>{content}</PermissionGuard> : content;
}
