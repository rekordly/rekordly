"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Key, LockKey } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AuthCard } from "@/components/ui/auth-card";
import { ApiClientError } from "@/lib/errors";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handleResetPasswordCompleteSubmit,
  scrubTokenFromBrowserUrl,
} from "@/stores/auth-store";
import { AUTH_ROUTES } from "@/lib/auth";
import {
  MAX_PASSWORD_UTF8_BYTES,
  MIN_PASSWORD_UTF8_BYTES,
  type ResetPasswordFormValues,
  resetPasswordSchema,
} from "@/lib/schemas/auth.schemas";

export interface ResetPasswordScreenProps {
  initialToken?: string | null;
  api?: AuthApiContract;
}

export function ResetPasswordScreen({
  initialToken,
  api,
}: ResetPasswordScreenProps) {
  const router = useRouter();

  // Keep the single-use reset token strictly in component memory
  const [inMemoryToken] = useState<string>(() => (initialToken ?? "").trim());
  const [isProofInvalid, setIsProofInvalid] = useState<boolean>(
    () => (initialToken ?? "").trim().length === 0,
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const submissionGuardRef = useRef(createSubmissionGuard());

  useEffect(() => {
    if (inMemoryToken) {
      // Replace the token-bearing query string in browser history immediately
      // while retaining the token only in component memory.
      scrubTokenFromBrowserUrl(AUTH_ROUTES.RESET_PASSWORD);
    }
  }, [inMemoryToken]);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    await submissionGuardRef.current.run(async () => {
      setApiError(null);
      setIsBusy(true);
      try {
        const outcome = await handleResetPasswordCompleteSubmit(
          inMemoryToken,
          values,
          { api },
        );
        setIsRedirecting(true);
        router.push(outcome.destination);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          if (error.code === "INVALID_PROOF") {
            setIsProofInvalid(true);
          }
          setApiError(error.message);
        } else {
          setApiError("Unable to reset your password right now. Please try again.");
        }
      } finally {
        setIsBusy(false);
      }
    });
  };

  const isLoading = isBusy || isRedirecting || form.formState.isSubmitting;

  if (isProofInvalid) {
    return (
      <AuthCard
        title="Reset link expired or invalid"
        subtitle="Request a new link to continue"
        alert={
          <Alert
            status="warning"
            title="Link unavailable"
            description={
              apiError ??
              "This link is invalid, expired, or has already been used."
            }
            data-testid="reset-password-invalid-proof"
          />
        }
        footer={
          <AppButton
            variant="ghost"
            size="md"
            fullWidth
            startContent={<ArrowLeft className="size-4" />}
            onPress={() => router.push(AUTH_ROUTES.LOGIN)}
            data-testid="reset-password-back-login"
          >
            Back to sign in
          </AppButton>
        }
      >
        <AppButton
          variant="primary"
          size="md"
          fullWidth
          startContent={<Key />}
          onPress={() => router.push(AUTH_ROUTES.FORGOT_PASSWORD)}
          data-testid="reset-password-request-new"
        >
          Request a new reset link
        </AppButton>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Choose a password you do not use elsewhere"
      alert={
        apiError ? (
          <Alert
            status="error"
            title="Could not update password"
            description={apiError}
            onDismiss={() => setApiError(null)}
            data-testid="reset-password-error"
          />
        ) : null
      }
      footer={
        <AppButton
          variant="ghost"
          size="md"
          fullWidth
          isDisabled={isLoading}
          startContent={<ArrowLeft className="size-4" />}
          onPress={() => router.push(AUTH_ROUTES.LOGIN)}
        >
          Back to sign in
        </AppButton>
      }
    >
      <form
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
        noValidate
        className="flex flex-col gap-4"
        data-testid="reset-password-form"
      >
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <AppInput
              type="password"
              startContent={<LockKey />}
              id="reset-new-password"
              name={field.name}
              label="New password"
              autoComplete="new-password"
              placeholder="At least 10 characters"
              description={`${MIN_PASSWORD_UTF8_BYTES}–${MAX_PASSWORD_UTF8_BYTES} characters. A passphrase works well.`}
              value={field.value}
              onChange={(event) => {
                field.onChange(event.target.value);
                if (apiError) {
                  setApiError(null);
                }
              }}
              onBlur={field.onBlur}
              ref={field.ref}
              isDisabled={isLoading}
              isRequired
              isInvalid={Boolean(fieldState.error)}
              errorMessage={fieldState.error?.message}
              data-testid="reset-new-password-input"
            />
          )}
        />

        <Controller
          control={form.control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <AppInput
              type="password"
              startContent={<LockKey />}
              id="reset-confirm-password"
              name={field.name}
              label="Confirm new password"
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              value={field.value}
              onChange={(event) => {
                field.onChange(event.target.value);
                if (apiError) {
                  setApiError(null);
                }
              }}
              onBlur={field.onBlur}
              ref={field.ref}
              isDisabled={isLoading}
              isRequired
              isInvalid={Boolean(fieldState.error)}
              errorMessage={fieldState.error?.message}
              data-testid="reset-confirm-password-input"
            />
          )}
        />

        <AppButton
          type="submit"
          endContent={<ArrowRight weight="bold" />}
          variant="primary"
          size="md"
          fullWidth
          isLoading={isLoading}
                    data-testid="reset-password-submit"
        >
          {isLoading ? (isRedirecting ? "Redirecting..." : "Saving new password...") : "Save new password"}
        </AppButton>
      </form>
    </AuthCard>
  );
}
