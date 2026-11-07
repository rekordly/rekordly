"use client";

import { Button as HeroButton, cn } from "@heroui/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type RekordlyButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "outline"
  | "ghost"
  | "danger";

export type RekordlyButtonSize = "sm" | "md" | "lg";

type HeroButtonBaseProps = ComponentPropsWithoutRef<typeof HeroButton>;

export interface ButtonProps {
  children?: ReactNode;
  variant?: RekordlyButtonVariant;
  size?: RekordlyButtonSize;
  fullWidth?: boolean;
  isIconOnly?: boolean;
  isDisabled?: boolean;
  type?: HeroButtonBaseProps["type"];
  onPress?: HeroButtonBaseProps["onPress"];
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  className?: string;
  "aria-label"?: string;
  "aria-busy"?: boolean;
  "aria-pressed"?: boolean;
  "data-testid"?: string;
}

const SIZE_CLASSES: Readonly<Record<RekordlyButtonSize, string>> = {
  sm: "h-10 min-h-10 px-4 text-sm",
  md: "h-12 min-h-12 px-5 text-sm",
  lg: "h-13 min-h-13 px-6 text-base",
};

const ICON_ONLY_SIZE_CLASSES: Readonly<Record<RekordlyButtonSize, string>> = {
  sm: "size-9 min-h-9 min-w-9 p-0",
  md: "size-10 min-h-10 min-w-10 p-0",
  lg: "size-12 min-h-12 min-w-12 p-0",
};

const VARIANT_CLASSES: Readonly<Record<RekordlyButtonVariant, string>> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs border border-transparent",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary-hover shadow-xs border border-transparent",
  tertiary:
    "bg-surface-muted text-foreground hover:bg-surface-tertiary border border-border",
  outline:
    "bg-surface text-foreground hover:bg-surface-muted border border-border",
  ghost:
    "bg-transparent text-foreground hover:bg-surface-muted border border-transparent shadow-none",
  danger:
    "bg-danger text-danger-foreground hover:opacity-95 shadow-xs border border-transparent",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  isIconOnly = false,
  isDisabled = false,
  type = "button",
  onPress,
  startIcon,
  endIcon,
  className,
  "aria-label": ariaLabel,
  "aria-busy": ariaBusy,
  "aria-pressed": ariaPressed,
  "data-testid": dataTestId,
}: ButtonProps) {
  return (
    <HeroButton
      type={type}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      isIconOnly={isIconOnly}
      isDisabled={isDisabled}
      onPress={onPress}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      aria-pressed={ariaPressed}
      data-testid={dataTestId}
      className={cn(
        "inline-flex items-center justify-center gap-2.5 rounded-full font-sans font-medium transition-colors select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-60 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-60",
        isIconOnly ? ICON_ONLY_SIZE_CLASSES[size] : SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        fullWidth && "w-full",
        className,
      )}
    >
      {startIcon ? (
        <span className="inline-flex shrink-0 items-center justify-center" aria-hidden="true">
          {startIcon}
        </span>
      ) : null}
      {children}
      {endIcon ? (
        <span className="inline-flex shrink-0 items-center justify-center" aria-hidden="true">
          {endIcon}
        </span>
      ) : null}
    </HeroButton>
  );
}
