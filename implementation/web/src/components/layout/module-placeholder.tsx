"use client";

import { ArrowRight, CircleNotch } from "@phosphor-icons/react";
import Link from "next/link";

import { PermissionGuard } from "@/components/auth/permission";
import { Button, SurfaceCard } from "@/components/ui";

export function ModulePlaceholder({ title, description, permission, actionLabel = "Add record", actionHref = "/dashboard" }: { title: string; description: string; permission?: string; actionLabel?: string; actionHref?: string }) {
  const content = <main className="p-5 sm:p-7"><div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{permission ? "Workspace module" : "Personal space"}</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p></div><Link href={actionHref}><Button endIcon={<ArrowRight />}>{actionLabel}</Button></Link></div><SurfaceCard className="mt-8 min-h-64 items-center justify-center text-center shadow-none"><CircleNotch size={28} weight="duotone" className="text-primary" /><p className="mt-3 text-sm font-medium">Your {title.toLowerCase()} will appear here.</p><p className="mt-1 text-sm text-muted-foreground">The shell and permissions are ready for this module.</p></SurfaceCard></div></main>;
  return permission ? <PermissionGuard permission={permission}>{content}</PermissionGuard> : content;
}
