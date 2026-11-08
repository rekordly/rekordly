"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, MailCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  Alert,
  AuthCard,
  AuthDivider,
  Button,
  LoadingButton,
  PasswordField,
  TextField,
} from "@/components/ui";
import { ApiClientError } from "@/lib/api/client";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handleMagicLinkRequestSubmit,
  handleOtpRequestSubmit,
  handlePasswordSignInSubmit,
} from "@/lib/auth/controllers";
import { AUTH_ROUTES } from "@/lib/auth/onboarding-routes";
import { useAuthFlowStore } from "@/lib/auth/state";
import {
  type PasswordSignInFormValues,
  passwordSignInSchema,
} from "@/lib/auth/validation";

export interface PasswordSignInScreenProps {
  initialEmail?: string;
  api?: AuthApiContract;
}

export function PasswordSignInScreen({
  initialEmail,
  api,
}: PasswordSignInScreenProps) {
  const router = useRouter();
  const storedEmail = useAuthFlowStore((state) => state.email);
  const setEmail = useAuthFlowStore((state) => state.setEmail);
  const setOtpContext = useAuthFlowStore((state) => state.setOtpContext);

  const [apiError, setApiError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isStartingOtp, setIsStartingOtp] = useState(false);
  const [isStartingMagic, setIsStartingMagic] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const submissionGuardRef = useRef(createSubmissionGuard());
  const alternateGuardRef = useRef(createSubmissionGuard());

  const form = useForm<PasswordSignInFormValues>({
    resolver: zodResolver(passwordSignInSchema),
    defaultValues: {
      email: initialEmail ?? storedEmail ?? "",
      password: "",
    },
  });

  const onSubmit = async (values: PasswordSignInFormValues) => {
    await submissionGuardRef.current.run(async () => {
      setApiError(null);
      setIsBusy(true);
      try {
        const outcome = await handlePasswordSignInSubmit(values, { api });
        setIsRedirecting(true);
        router.push(outcome.destination);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setApiError(error.message);
        } else {
          setApiError("Email or password is incorrect.");
        }
      } finally {
        setIsBusy(false);
      }
    });
  };

  const handleSignInWithOtp = async () => {
    const currentEmail = form.getValues("email").trim();
    if (!currentEmail) {
      setOtpContext("", "sign_in");
      router.push(AUTH_ROUTES.LOGIN_OTP);
      return;
    }
    const emailValid = await form.trigger("email");
    if (!emailValid) {
      return;
    }

    await alternateGuardRef.current.run(async () => {
      setApiError(null);
      setIsStartingOtp(true);
      try {
        await handleOtpRequestSubmit(
          {
            email: currentEmail,
            purpose: "sign_in",
          },
          api,
        );
        router.push(AUTH_ROUTES.LOGIN_OTP);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setApiError(error.message);
        } else {
          setApiError("Unable to send a verification code right now.");
        }
      } finally {
        setIsStartingOtp(false);
      }
    });
  };

  const handleSignInWithMagicLink = async () => {
    const currentEmail = form.getValues("email").trim();
    if (!currentEmail) {
      router.push(AUTH_ROUTES.LOGIN_MAGIC);
      return;
    }
    const emailValid = await form.trigger("email");
    if (!emailValid) {
      return;
    }

    await alternateGuardRef.current.run(async () => {
      setApiError(null);
      setIsStartingMagic(true);
      try {
        await handleMagicLinkRequestSubmit({ email: currentEmail }, { api });
        router.push(AUTH_ROUTES.LOGIN_MAGIC);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setApiError(error.message);
        } else {
          setApiError("Unable to send a sign-in link right now.");
        }
      } finally {
        setIsStartingMagic(false);
      }
    });
  };

  const handleBackToEmail = () => {
    const currentEmail = form.getValues("email").trim();
    if (currentEmail) {
      setEmail(currentEmail);
    }
    router.push(AUTH_ROUTES.LOGIN);
  };

  const isLoading =
    isBusy ||
    isStartingOtp ||
    isStartingMagic ||
    isRedirecting ||
    form.formState.isSubmitting;

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Enter your password to sign in to Rekordly"
      alert={
        apiError ? (
          <Alert
            status="error"
            title="Sign-in failed"
            description={apiError}
            onDismiss={() => setApiError(null)}
            data-testid="password-signin-error"
          />
        ) : null
      }
      footer={
        <div className="flex w-full items-center justify-between gap-4 pt-1">
          <Button
            variant="ghost"
            size="sm"
            isDisabled={isLoading}
            startIcon={<ArrowLeft className="size-4" />}
            onPress={handleBackToEmail}
            className="px-2.5"
            data-testid="password-back-button"
          >
            Back
          </Button>

          <Link
            href={AUTH_ROUTES.FORGOT_PASSWORD}
            onClick={() => {
              const currentEmail = form.getValues("email").trim();
              if (currentEmail) {
                setEmail(currentEmail);
              }
            }}
            className="rounded-lg px-2 py-1 font-sans text-sm font-medium text-primary transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            data-testid="forgot-password-link"
          >
            Forgot password?
          </Link>
        </div>
      }
    >
      <form
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
        noValidate
        className="flex flex-col gap-4"
        data-testid="password-signin-form"
      >
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              id="signin-email"
              name={field.name}
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="username"
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
              data-testid="signin-email-input"
            />
          )}
        />

        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <PasswordField
              id="signin-password"
              name={field.name}
              label="Password"
              autoComplete="current-password"
              placeholder="Enter your password"
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
              data-testid="signin-password-input"
            />
          )}
        />

        <LoadingButton
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isBusy || isRedirecting}
          loadingText={isRedirecting ? "Redirecting..." : "Signing in..."}
          data-testid="password-signin-submit"
        >
          Sign in
        </LoadingButton>
      </form>

      <AuthDivider label="or" />

      <div className="flex flex-col gap-2.5">
        <LoadingButton
          type="button"
          variant="outline"
          size="md"
          fullWidth
          isDisabled={isLoading}
          isLoading={isStartingOtp}
          loadingText="Sending code..."
          startIcon={<MailCheck className="size-4 text-primary" />}
          onPress={() => {
            void handleSignInWithOtp();
          }}
          data-testid="signin-with-otp-button"
        >
          Sign in with email code
        </LoadingButton>

        <LoadingButton
          type="button"
          variant="outline"
          size="md"
          fullWidth
          isDisabled={isLoading}
          isLoading={isStartingMagic}
          loadingText="Sending link..."
          startIcon={<Sparkles className="size-4 text-primary" />}
          onPress={() => {
            void handleSignInWithMagicLink();
          }}
          data-testid="signin-with-magic-link-button"
        >
          Email me a magic link
        </LoadingButton>
      </div>
    </AuthCard>
  );
}
