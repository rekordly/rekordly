"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { TextField, type TextFieldProps } from "./text-field";

export type PasswordFieldProps = Omit<TextFieldProps, "type" | "endAddon">;

export function PasswordField({
  inputRef,
  isDisabled = false,
  autoComplete = "current-password",
  ...rest
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  const handleToggleVisibility = (event: React.MouseEvent<HTMLButtonElement>) => {
    const groupContainer = event.currentTarget.parentElement?.parentElement;
    const inputNode = groupContainer?.querySelector("input") ?? null;
    const selectionStart = inputNode?.selectionStart ?? null;
    const selectionEnd = inputNode?.selectionEnd ?? null;
    const wasFocused =
      typeof document !== "undefined" && document.activeElement === inputNode;

    setIsVisible((prev) => !prev);

    if (inputNode && wasFocused) {
      requestAnimationFrame(() => {
        inputNode.focus({ preventScroll: true });
        if (selectionStart !== null && selectionEnd !== null) {
          try {
            inputNode.setSelectionRange(selectionStart, selectionEnd);
          } catch {
            // Ignore selection range errors on unsupported input states
          }
        }
      });
    }
  };

  return (
    <TextField
      {...rest}
      inputRef={inputRef}
      type={isVisible ? "text" : "password"}
      isDisabled={isDisabled}
      autoComplete={autoComplete}
      endAddon={
        <button
          type="button"
          disabled={isDisabled}
          aria-label={isVisible ? "Hide password" : "Show password"}
          aria-pressed={isVisible}
          onClick={handleToggleVisibility}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-sans text-xs font-medium text-primary transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isVisible ? (
            <>
              <EyeOff className="size-3.5" aria-hidden="true" />
              <span>Hide</span>
            </>
          ) : (
            <>
              <Eye className="size-3.5" aria-hidden="true" />
              <span>Show</span>
            </>
          )}
        </button>
      }
    />
  );
}
