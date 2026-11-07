"use client";

import { Card as HeroCard, Chip as HeroChip, cn } from "@heroui/react";
import type { ReactNode } from "react";

export interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
}

export function SurfaceCard({ children, className }: SurfaceCardProps) {
  return (
    <HeroCard.Root
      variant="default"
      className={cn(
        "rounded-3xl border border-border bg-surface p-6 text-foreground shadow-sm sm:p-10",
        className,
      )}
    >
      <HeroCard.Content className="flex flex-col gap-6 p-0">
        {children}
      </HeroCard.Content>
    </HeroCard.Root>
  );
}

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: "primary" | "secondary" | "neutral";
  className?: string;
}

export function StatusBadge({
  children,
  tone = "primary",
  className,
}: StatusBadgeProps) {
  return (
    <HeroChip.Root
      color={tone === "primary" ? "success" : tone === "secondary" ? "warning" : "default"}
      variant="soft"
      size="sm"
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 font-sans text-xs font-semibold",
        tone === "primary" && "bg-primary-soft text-primary",
        tone === "secondary" && "bg-secondary-soft text-secondary",
        tone === "neutral" && "bg-surface-muted text-muted-foreground",
        className,
      )}
    >
      <HeroChip.Label>{children}</HeroChip.Label>
    </HeroChip.Root>
  );
}
