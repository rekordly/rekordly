"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  Alert,
  AuthCard,
  Button,
  LoadingButton,
  PasswordField,
  TextField,
} from "@/components/ui";
import { ApiClientError } from "@/lib/api/client";
import {
  type AuthApiContract,
  createSubmissionGuard,
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

  const handleBackToEmail = () => {
    const currentEmail = form.getValues("email").trim();
    if (currentEmail) {
      setEmail(currentEmail);
    }
    router.push(AUTH_ROUTES.LOGIN);
  };

  const isLoading = isBusy || isRedirecting || form.formState.isSubmitting;

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
            className="rounded-lg px-2 py-1 font-sans text-sm font-medium text-primary transition-colors hover:text-primary-hover focus:outline-none"
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
          isLoading={isLoading}
          loadingText={isRedirecting ? "Redirecting..." : "Signing in..."}
          data-testid="password-signin-submit"
        >
          Sign in
        </LoadingButton>
      </form>
    </AuthCard>
  );
}
