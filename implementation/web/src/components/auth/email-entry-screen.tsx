"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  Alert,
  AuthCard,
  AuthDivider,
  Button,
  LoadingButton,
  TextField,
} from "@/components/ui";
import { ApiClientError } from "@/lib/api/client";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handleEmailContinuationSubmit,
} from "@/lib/auth/controllers";
import { AUTH_ROUTES } from "@/lib/auth/onboarding-routes";
import { useAuthFlowStore } from "@/lib/auth/state";
import {
  type EmailContinueFormValues,
  emailContinueSchema,
} from "@/lib/auth/validation";

export interface EmailEntryScreenProps {
  initialReturnTo?: string | null;
  initialEmail?: string;
  initialView?: "email" | "registration";
  api?: AuthApiContract;
}

export function EmailEntryScreen({
  initialReturnTo,
  initialEmail,
  initialView = "email",
  api,
}: EmailEntryScreenProps) {
  const router = useRouter();
  const storedEmail = useAuthFlowStore((state) => state.email);
  const setEmail = useAuthFlowStore((state) => state.setEmail);
  const setReturnTo = useAuthFlowStore((state) => state.setReturnTo);

  const [view, setView] = useState<"email" | "registration">(initialView);
  const [registrationEmail, setRegistrationEmail] = useState<string>(
    initialEmail ?? storedEmail ?? "",
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const submissionGuardRef = useRef(createSubmissionGuard());

  useEffect(() => {
    if (initialReturnTo !== undefined) {
      setReturnTo(initialReturnTo);
    }
  }, [initialReturnTo, setReturnTo]);

  const form = useForm<EmailContinueFormValues>({
    resolver: zodResolver(emailContinueSchema),
    defaultValues: {
      email: initialEmail ?? storedEmail ?? "",
    },
  });

  const onSubmit = async (values: EmailContinueFormValues) => {
    await submissionGuardRef.current.run(async () => {
      setApiError(null);
      setIsBusy(true);
      try {
        const outcome = await handleEmailContinuationSubmit(values, api);
        if (outcome.continuation === "password" && outcome.nextRoute) {
          router.push(outcome.nextRoute);
          return;
        }
        setRegistrationEmail(outcome.email);
        setView("registration");
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setApiError(error.message);
        } else {
          setApiError("Unable to continue right now. Please try again.");
        }
      } finally {
        setIsBusy(false);
      }
    });
  };

  const handleContinueWithPasswordDirect = () => {
    const currentEmail = form.getValues("email").trim();
    if (currentEmail) {
      setEmail(currentEmail);
    }
    router.push(AUTH_ROUTES.LOGIN_PASSWORD);
  };

  const handleBackToEmail = () => {
    setApiError(null);
    setView("email");
  };

  const isLoading = isBusy || form.formState.isSubmitting;

  if (view === "registration") {
    return (
      <AuthCard
        title="Verify your email"
        subtitle={
          <>
            Email verification is required to create your Rekordly account for{" "}
            <span className="font-semibold text-foreground">
              {registrationEmail || form.getValues("email")}
            </span>
            .
          </>
        }
        alert={
          <Alert
            status="info"
            title="Email verification required"
            description="To protect your financial workspace, new accounts must verify email ownership with a single-use code before creating a password."
            data-testid="registration-verification-notice"
          />
        }
        footer={
          <Button
            variant="ghost"
            size="md"
            fullWidth
            startIcon={<ArrowLeft className="size-4" />}
            onPress={handleBackToEmail}
            data-testid="registration-change-email-button"
          >
            Use a different email address
          </Button>
        }
      >
        <div
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-2xs"
          data-testid="registration-otp-slot"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <MailCheck className="size-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Next step: 6-digit verification code
              </h2>
              <p className="font-sans text-xs leading-relaxed text-muted-foreground">
                Once email OTP verification is active in this environment, you will enter the single-use verification code sent to your inbox and then set your password.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-surface-muted px-3.5 py-2.5 font-sans text-xs text-muted-foreground">
            Already have a Rekordly password for a different address? Go back to switch emails or sign in with your password.
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome"
      subtitle="Sign in or create an account to continue"
      alert={
        apiError ? (
          <Alert
            status="error"
            title="Unable to continue"
            description={apiError}
            onDismiss={() => setApiError(null)}
            data-testid="auth-top-error"
          />
        ) : null
      }
    >
      <form
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
        noValidate
        className="flex flex-col gap-4"
        data-testid="email-continue-form"
      >
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              id="auth-email"
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
              data-testid="email-input"
            />
          )}
        />

        <LoadingButton
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isLoading}
          loadingText="Continuing..."
          data-testid="email-continue-submit"
        >
          Continue with email
        </LoadingButton>
      </form>

      <AuthDivider label="or" />

      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          size="md"
          fullWidth
          isDisabled={isLoading}
          startIcon={<KeyRound className="size-4 text-primary" />}
          onPress={handleContinueWithPasswordDirect}
          data-testid="continue-with-password-button"
        >
          Continue with password
        </Button>
      </div>
    </AuthCard>
  );
}
