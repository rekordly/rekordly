"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  Alert,
  AuthCard,
  Button,
  LoadingButton,
  TextField,
} from "@/components/ui";
import { NEUTRAL_PASSWORD_RESET_MESSAGE } from "@/lib/auth-api";
import { ApiClientError } from "@/lib/api";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handleForgotPasswordSubmit,
} from "@/lib/auth-flow";
import { AUTH_ROUTES } from "@/lib/auth-routes";
import { useAuthFlowStore } from "@/stores/auth-flow-store";
import {
  type ForgotPasswordFormValues,
  forgotPasswordSchema,
} from "@/lib/validation";

export interface ForgotPasswordScreenProps {
  initialEmail?: string;
  api?: AuthApiContract;
}

export function ForgotPasswordScreen({
  initialEmail,
  api,
}: ForgotPasswordScreenProps) {
  const router = useRouter();
  const storedEmail = useAuthFlowStore((state) => state.email);

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
        <Button
          variant="ghost"
          size="md"
          fullWidth
          isDisabled={isLoading}
          startIcon={<ArrowLeft className="size-4" />}
          onPress={() => router.push(AUTH_ROUTES.LOGIN)}
          data-testid="forgot-password-back-button"
        >
          Back to sign in
        </Button>
      }
    >
      {submittedMessage ? (
        <div className="flex flex-col gap-3">
          <Button
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
          </Button>
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
              <TextField
                id="forgot-password-email"
                name={field.name}
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  if (apiError) {
                    setApiError(null);
                  }
                }}
                onBlur={field.onBlur}
                inputRef={field.ref}
                isDisabled={isLoading}
                isRequired
                isInvalid={Boolean(fieldState.error)}
                errorMessage={fieldState.error?.message}
                data-testid="forgot-password-email-input"
              />
            )}
          />

          <LoadingButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            loadingText="Sending..."
            data-testid="forgot-password-submit"
          >
            Send reset link
          </LoadingButton>
        </form>
      )}
    </AuthCard>
  );
}
