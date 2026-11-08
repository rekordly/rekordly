"use client";

import { cn, Description, FieldError, Label } from "@heroui/react";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

import { getFormFieldAccessibilityIds } from "@/lib/auth/accessibility";

export { getFormFieldAccessibilityIds };

export interface FormFieldProps {
  id: string;
  label: string;
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  labelAction?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FormField({
  id,
  label,
  description,
  errorMessage,
  isInvalid = false,
  isDisabled = false,
  isRequired = false,
  labelAction,
  children,
  className,
}: FormFieldProps) {
  const showError = Boolean(errorMessage) || isInvalid;
  const { labelId, descriptionId, errorId } = getFormFieldAccessibilityIds(id, {
    hasDescription: Boolean(description),
    hasError: Boolean(errorMessage),
  });

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label
          id={labelId}
          htmlFor={id}
          isDisabled={isDisabled}
          isInvalid={showError}
          isRequired={isRequired}
          className={cn(
            "font-sans text-[13px] font-medium text-foreground select-none",
            showError && "text-danger",
            isDisabled && "opacity-60",
          )}
        >
          {label}
        </Label>
        {labelAction ? <div className="text-sm">{labelAction}</div> : null}
      </div>

      {children}

      {description ? (
        <Description
          id={descriptionId}
          className="font-sans text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </Description>
      ) : null}

      {errorMessage ? (
        <FieldError
          id={errorId}
          className="mt-0.5 flex items-start gap-1.5 font-sans text-xs font-medium text-danger"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span role="alert">{errorMessage}</span>
        </FieldError>
      ) : null}
    </div>
  );
}
