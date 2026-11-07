"use client";

import { Spinner } from "@heroui/react";

import { Button, type ButtonProps } from "./button";

export interface LoadingButtonProps extends ButtonProps {
  isLoading?: boolean;
  loadingText?: string;
}

export function LoadingButton({
  children,
  isLoading = false,
  loadingText,
  isDisabled = false,
  startIcon,
  ...rest
}: LoadingButtonProps) {
  return (
    <Button
      {...rest}
      isDisabled={isDisabled || isLoading}
      aria-busy={isLoading}
      startIcon={
        isLoading ? (
          <Spinner size="sm" color="current" aria-hidden="true" />
        ) : (
          startIcon
        )
      }
    >
      <span className="inline-flex items-center justify-center truncate">
        {isLoading && loadingText ? loadingText : children}
      </span>
    </Button>
  );
}
