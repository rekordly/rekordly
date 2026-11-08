"use client";

import type { ComponentType } from "react";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  Buildings,
  ChartPieSlice,
  CheckCircle,
  CloudSlash,
  CreditCard,
  DownloadSimple,
  FileText,
  Gauge,
  HandCoins,
  Info,
  LockKey,
  PlusCircle,
  Receipt,
  Scales,
  ShoppingCart,
  Sparkle,
  SplitVertical,
  SquaresFour,
  User,
  Wallet,
  Warning,
  type IconProps,
} from "@phosphor-icons/react";

const ICON_MAP: Record<string, ComponentType<IconProps>> = {
  Sparkle,
  ArrowsLeftRight,
  Receipt,
  ShoppingCart,
  FileText,
  CreditCard,
  HandCoins,
  Wallet,
  SplitVertical,
  ChartPieSlice,
  Scales,
  CloudSlash,
  Gauge,
  PlusCircle,
  CheckCircle,
  DownloadSimple,
  ArrowsClockwise,
  LockKey,
  Info,
  Warning,
  Buildings,
  User,
  SquaresFour,
};

export interface FeatureIconProps extends IconProps {
  name: string;
}

export function FeatureIcon({
  name,
  weight = "duotone",
  size = 20,
  className,
  ...rest
}: FeatureIconProps) {
  const IconComponent = ICON_MAP[name] ?? Sparkle;
  return (
    <IconComponent
      weight={weight}
      size={size}
      className={className}
      {...rest}
    />
  );
}
