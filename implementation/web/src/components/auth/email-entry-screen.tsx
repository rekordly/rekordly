"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, EnvelopeSimple, Key } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { OtpCard } from "@/components/auth/otp-card";
import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AuthCard, AuthDivider } from "@/components/ui/auth-card";
import { GoogleLogo } from "@/components/ui/google-logo";
import {
  authApi,
  AUTH_ROUTES,
} from "@/lib/auth";
import { ApiClientError } from "@/lib/errors";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handleEmailContinuationSubmit,
  startGoogleSignIn,
  useAuthStore,
} from "@/stores/auth-store";
import {
  type EmailContinueFormValues,
  emailContinueSchema,
} from "@/lib/schemas/auth.schemas";

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
  const storedEmail = useAuthStore((state) => state.email);
  const setEmail = useAuthStore((state) => state.setEmail);
  const setReturnTo = useAuthStore((state) => state.setReturnTo);

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
        // The email step only classifies the address; the code is requested here.
        await (api ?? authApi).requestOtp(outcome.email, "registration");
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

  const isLoading = isBusy || form.formState.isSubmitting;

  if (view === "registration") {
    return (
      <OtpCard
        email={registrationEmail || form.getValues("email")}
        purpose="registration"
        title="Verify your email"
        backLabel="Change email"
        onBack={() => {
          setApiError(null);
          setView("email");
        }}
      />
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
            <AppInput
              id="auth-email"
              name={field.name}
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              startContent={<EnvelopeSimple />}
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
              data-testid="email-input"
            />
          )}
        />

        <AppButton
          type="submit"
          size="md"
          fullWidth
          isLoading={isLoading}
          endContent={<ArrowRight weight="bold" />}
          data-testid="email-continue-submit"
        >
          {isLoading ? "Continuing..." : "Continue with email"}
        </AppButton>
      </form>

      <AuthDivider label="or" />

      <div className="flex flex-col gap-3">
        <AppButton
          variant="outline"
          fullWidth
          isDisabled={isLoading}
          startContent={<GoogleLogo />}
          onPress={() => void startGoogleSignIn(setApiError)}
          data-testid="continue-with-google-button"
        >
          Continue with Google
        </AppButton>
        <AppButton
          variant="outline"
          fullWidth
          isDisabled={isLoading}
          startContent={<Key />}
          onPress={handleContinueWithPasswordDirect}
          data-testid="continue-with-password-button"
        >
          Continue with password
        </AppButton>
      </div>
    </AuthCard>
  );
}
