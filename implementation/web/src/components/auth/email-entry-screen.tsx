"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, EnvelopeSimple, GoogleLogo, Key } from "@phosphor-icons/react";
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
import { ApiClientError, resolveApiBaseUrl } from "@/lib/api";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handleEmailContinuationSubmit,
} from "@/lib/auth-flow";
import { AUTH_ROUTES } from "@/lib/auth-routes";
import { useAuthFlowStore } from "@/stores/auth-flow-store";
import {
  type EmailContinueFormValues,
  emailContinueSchema,
} from "@/lib/validation";

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

  const handleGoogleSignIn = () => {
    const returnTo = useAuthFlowStore.getState().returnTo ?? "/dashboard";
    window.open(
      `${resolveApiBaseUrl()}/api/v1/auth/google/start?return_to=${encodeURIComponent(returnTo)}`,
      "_self",
    );
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
            We sent a 6-digit code to{" "}
            <span className="font-semibold text-foreground">
              {registrationEmail || form.getValues("email")}
            </span>
          </>
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
            Change email
          </Button>
        }
      >
        <div
          className="flex flex-col gap-3 rounded-xl bg-surface-muted p-4 shadow-none"
          data-testid="registration-otp-slot"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <EnvelopeSimple size={20} weight="duotone" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Enter your verification code
              </h2>
              <p className="font-sans text-xs leading-relaxed text-muted-foreground">
                The code expires shortly. Check spam if it does not arrive.
              </p>
            </div>
          </div>

        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome"
      subtitle="Enter your email to continue"
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
          startIcon={<GoogleLogo />}
          onPress={handleGoogleSignIn}
          data-testid="continue-with-google-button"
        >
          Continue with Google
        </Button>
        <Button
          variant="outline"
          size="md"
          fullWidth
          isDisabled={isLoading}
          startIcon={<Key className="text-primary" />}
          onPress={handleContinueWithPasswordDirect}
          data-testid="continue-with-password-button"
        >
          Continue with password
        </Button>
      </div>
    </AuthCard>
  );
}
