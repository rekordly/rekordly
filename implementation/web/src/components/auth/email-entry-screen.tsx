"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { GoogleMarkIcon } from "@/components/auth/google-auth-screen";
import { OtpVerificationScreen } from "@/components/auth/otp-verification-screen";
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
  handleGoogleStart,
  handleOtpRequestSubmit,
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
  const [isStartingGoogle, setIsStartingGoogle] = useState(false);
  const submissionGuardRef = useRef(createSubmissionGuard());
  const googleGuardRef = useRef(createSubmissionGuard());

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
        await handleOtpRequestSubmit(
          {
            email: outcome.email,
            purpose: "registration",
          },
          api,
        );
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

  const handleContinueWithGoogle = async () => {
    await googleGuardRef.current.run(async () => {
      setApiError(null);
      setIsStartingGoogle(true);
      try {
        await handleGoogleStart({
          api,
          returnTo: initialReturnTo,
        });
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setApiError(error.message);
        } else {
          setApiError("Google sign-in is not available right now.");
        }
      } finally {
        setIsStartingGoogle(false);
      }
    });
  };

  const handleBackToEmail = () => {
    setApiError(null);
    setView("email");
  };

  const isLoading = isBusy || isStartingGoogle || form.formState.isSubmitting;

  if (view === "registration") {
    return (
      <OtpVerificationScreen
        initialEmail={registrationEmail || form.getValues("email")}
        initialPurpose="registration"
        onBackToEmail={handleBackToEmail}
        api={api}
      />
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
        <LoadingButton
          type="button"
          variant="outline"
          size="md"
          fullWidth
          isDisabled={isLoading}
          isLoading={isStartingGoogle}
          loadingText="Connecting to Google..."
          startIcon={<GoogleMarkIcon className="size-4" />}
          onPress={() => {
            void handleContinueWithGoogle();
          }}
          data-testid="continue-with-google-button"
        >
          Continue with Google
        </LoadingButton>

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
