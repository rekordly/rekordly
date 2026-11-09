"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, EnvelopeSimple, LockKey, Password } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { OtpCard } from "@/components/auth/otp-card";
import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AuthCard, AuthDivider } from "@/components/ui/auth-card";
import { GoogleLogo } from "@/components/ui/google-logo";
import {
  authApi,
  NEUTRAL_MAGIC_LINK_MESSAGE,
  AUTH_ROUTES,
} from "@/lib/auth";
import { ApiClientError } from "@/lib/errors";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handlePasswordSignInSubmit,
  startGoogleSignIn,
  useAuthStore,
} from "@/stores/auth-store";
import {
  type PasswordSignInFormValues,
  passwordSignInSchema,
} from "@/lib/schemas/auth.schemas";

export interface PasswordSignInScreenProps {
  initialEmail?: string;
  api?: AuthApiContract;
}

type View = "password" | "magic-sent" | "otp";

export function PasswordSignInScreen({
  initialEmail,
  api,
}: PasswordSignInScreenProps) {
  const router = useRouter();
  const storedEmail = useAuthStore((state) => state.email);
  const setEmail = useAuthStore((state) => state.setEmail);

  const [view, setView] = useState<View>("password");
  const [apiError, setApiError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const submissionGuardRef = useRef(createSubmissionGuard());

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

  /** Magic link and one-time code only need a valid email, not the password field. */
  const sendEmailProof = async (send: (email: string) => Promise<void>, nextView: View) => {
    if (!(await form.trigger("email"))) return;
    await submissionGuardRef.current.run(async () => {
      setApiError(null);
      setIsBusy(true);
      try {
        const email = form.getValues("email").trim();
        setEmail(email);
        await send(email);
        setView(nextView);
      } catch (error: unknown) {
        setApiError(
          error instanceof ApiClientError ? error.message : "Unable to send that right now. Please try again.",
        );
      } finally {
        setIsBusy(false);
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

  const isLoading = isBusy || isRedirecting || form.formState.isSubmitting;

  if (view === "otp") {
    return (
      <OtpCard
        email={form.getValues("email").trim()}
        purpose="sign_in"
        title="Enter your code"
        backLabel="Back"
        onBack={() => setView("password")}
      />
    );
  }

  if (view === "magic-sent") {
    return (
      <AuthCard
        title="Check your email"
        subtitle={NEUTRAL_MAGIC_LINK_MESSAGE}
        footer={
          <AppButton
            variant="ghost"
            fullWidth
            startContent={<ArrowLeft />}
            label="Back to sign in"
            onPress={() => setView("password")}
            data-testid="magic-link-back-button"
          />
        }
      >
        <div className="flex items-start gap-3 rounded-2xl bg-surface-secondary p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <EnvelopeSimple size={20} aria-hidden="true" />
          </span>
          <p className="text-[13px] text-muted">
            Open the link on this device. It works once and expires shortly. Check spam if it does not arrive.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in with your password"
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
            <AppInput
              id="signin-email"
              name={field.name}
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="username"
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
              data-testid="signin-email-input"
            />
          )}
        />

        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <AppInput
              type="password"
              id="signin-password"
              name={field.name}
              label="Password"
              autoComplete="current-password"
              placeholder="Enter your password"
              startContent={<LockKey />}
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
              data-testid="signin-password-input"
            />
          )}
        />

        <AppButton
          type="submit"
          size="md"
          fullWidth
          isLoading={isLoading}
          endContent={<ArrowRight weight="bold" />}
          data-testid="password-signin-submit"
        >
          {isLoading ? (isRedirecting ? "Redirecting..." : "Signing in...") : "Sign in"}
        </AppButton>
      </form>

      <div className="flex items-center justify-between gap-4">
        <AppButton
          variant="ghost"
          size="sm"
          isDisabled={isLoading}
          startContent={<ArrowLeft />}
          onPress={handleBackToEmail}
          label="Back"
          data-testid="password-back-button"
        />
        <Link
          href={AUTH_ROUTES.FORGOT_PASSWORD}
          onClick={() => {
            const currentEmail = form.getValues("email").trim();
            if (currentEmail) {
              setEmail(currentEmail);
            }
          }}
          className="text-[13px] font-medium text-link hover:underline"
          data-testid="forgot-password-link"
        >
          Forgot password?
        </Link>
      </div>

      <AuthDivider label="or" />

      <div className="flex flex-col gap-3">
        <AppButton
          variant="outline"
          fullWidth
          isDisabled={isLoading}
          startContent={<Password />}
          label="Sign in with a code"
          onPress={() => void sendEmailProof((email) => authApi.requestOtp(email, "sign_in"), "otp")}
          data-testid="signin-otp-button"
        />
        <AppButton
          variant="outline"
          fullWidth
          isDisabled={isLoading}
          startContent={<EnvelopeSimple />}
          label="Email me a magic link"
          onPress={() =>
            void sendEmailProof(
              (email) => authApi.requestMagicLink(email, useAuthStore.getState().returnTo),
              "magic-sent",
            )
          }
          data-testid="magic-link-button"
        />
        <AppButton
          variant="outline"
          fullWidth
          isDisabled={isLoading}
          startContent={<GoogleLogo />}
          label="Continue with Google"
          onPress={() => void startGoogleSignIn(setApiError)}
          data-testid="password-google-button"
        />
      </div>
    </AuthCard>
  );
}
