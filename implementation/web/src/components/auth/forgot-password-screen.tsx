"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, EnvelopeSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AuthCard } from "@/components/ui/auth-card";
import {
  NEUTRAL_PASSWORD_RESET_MESSAGE,
  AUTH_ROUTES,
} from "@/lib/auth";
import { ApiClientError } from "@/lib/errors";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handleForgotPasswordSubmit,
  useAuthStore,
} from "@/stores/auth-store";
import {
  type ForgotPasswordFormValues,
  forgotPasswordSchema,
} from "@/lib/schemas/auth.schemas";

export interface ForgotPasswordScreenProps {
  initialEmail?: string;
  api?: AuthApiContract;
}

export function ForgotPasswordScreen({
  initialEmail,
  api,
}: ForgotPasswordScreenProps) {
  const router = useRouter();
  const storedEmail = useAuthStore((state) => state.email);

  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const submissionGuardRef = useRef(createSubmissionGuard());

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: initialEmail ?? storedEmail ?? "",
    },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    await submissionGuardRef.current.run(async () => {
      setApiError(null);
      setIsBusy(true);
      try {
        await handleForgotPasswordSubmit(values, api);
        setSubmittedMessage(NEUTRAL_PASSWORD_RESET_MESSAGE);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setApiError(error.message);
        } else {
          setApiError("Unable to process your reset request right now. Please try again.");
        }
      } finally {
        setIsBusy(false);
      }
    });
  };

  const isLoading = isBusy || form.formState.isSubmitting;

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We’ll email you a secure reset link"
      alert={
        submittedMessage ? (
          <Alert
            status="success"
            title="Check your email"
            description={NEUTRAL_PASSWORD_RESET_MESSAGE}
            data-testid="forgot-password-neutral-notice"
          />
        ) : apiError ? (
          <Alert
            status="error"
            title="Request not completed"
            description={apiError}
            onDismiss={() => setApiError(null)}
            data-testid="forgot-password-error"
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
          data-testid="forgot-password-back-button"
        >
          Back to sign in
        </AppButton>
      }
    >
      {submittedMessage ? (
        <div className="flex flex-col gap-3">
          <AppButton
            variant="outline"
            size="md"
            fullWidth
            onPress={() => {
              setSubmittedMessage(null);
              setApiError(null);
            }}
            data-testid="forgot-password-try-another-button"
          >
            Try another email
          </AppButton>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            void form.handleSubmit(onSubmit)(event);
          }}
          noValidate
          className="flex flex-col gap-4"
          data-testid="forgot-password-form"
        >
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <AppInput
                id="forgot-password-email"
                name={field.name}
                label="Email"
                startContent={<EnvelopeSimple />}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
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
                data-testid="forgot-password-email-input"
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
                        data-testid="forgot-password-submit"
          >
            {isLoading ? "Sending..." : "Send reset link"}
          </AppButton>
        </form>
      )}
    </AuthCard>
  );
}
