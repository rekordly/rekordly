"use client";

import { Alert as HeroAlert, cn } from "@heroui/react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

export type RekordlyAlertStatus = "error" | "success" | "warning" | "info";

export interface AlertProps {
  status?: RekordlyAlertStatus;
  title?: string;
  description: ReactNode;
  onDismiss?: () => void;
  className?: string;
  "data-testid"?: string;
}

const DEFAULT_TITLES: Readonly<Record<RekordlyAlertStatus, string>> = {
  error: "Unable to continue",
  success: "Success",
  warning: "Please review",
  info: "Notice",
};

const HERO_STATUS_MAP: Readonly<
  Record<RekordlyAlertStatus, "danger" | "success" | "warning" | "accent">
> = {
  error: "danger",
  success: "success",
  warning: "warning",
  info: "accent",
};

const STATUS_CONTAINER_CLASSES: Readonly<Record<RekordlyAlertStatus, string>> = {
  error:
    "border-danger/30 bg-danger-soft text-foreground",
  success:
    "border-primary/30 bg-primary-soft text-foreground",
  warning:
    "border-secondary/35 bg-secondary-soft text-foreground",
  info:
    "border-border bg-surface-muted text-foreground",
};

const STATUS_ICON_CLASSES: Readonly<Record<RekordlyAlertStatus, string>> = {
  error: "text-danger",
  success: "text-primary",
  warning: "text-secondary",
  info: "text-primary",
};

function renderStatusIcon(status: RekordlyAlertStatus): ReactNode {
  switch (status) {
    case "error":
      return <AlertCircle className="size-4 shrink-0" aria-hidden="true" />;
    case "success":
      return <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />;
    case "warning":
      return <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />;
    case "info":
      return <Info className="size-4 shrink-0" aria-hidden="true" />;
  }
}

export function Alert({
  status = "info",
  title,
  description,
  onDismiss,
  className,
  "data-testid": dataTestId,
}: AlertProps) {
  const resolvedTitle = title ?? DEFAULT_TITLES[status];
  const role = status === "error" || status === "warning" ? "alert" : "status";

  return (
    <HeroAlert.Root
      status={HERO_STATUS_MAP[status]}
      role={role}
      aria-live={status === "error" ? "assertive" : "polite"}
      data-testid={dataTestId}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left font-sans text-sm shadow-2xs",
        STATUS_CONTAINER_CLASSES[status],
        className,
      )}
    >
      <HeroAlert.Indicator
        className={cn("mt-0.5 flex shrink-0 items-center", STATUS_ICON_CLASSES[status])}
      >
        {renderStatusIcon(status)}
      </HeroAlert.Indicator>

      <HeroAlert.Content className="flex min-w-0 flex-1 flex-col gap-0.5">
        {resolvedTitle ? (
          <HeroAlert.Title className="font-sans text-sm font-semibold text-foreground">
            {resolvedTitle}
          </HeroAlert.Title>
        ) : null}
        <HeroAlert.Description className="font-sans text-xs leading-relaxed text-muted-foreground">
          {description}
        </HeroAlert.Description>
      </HeroAlert.Content>

      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss message"
          onClick={onDismiss}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </HeroAlert.Root>
  );
}
