"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Link2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  Alert,
  AuthCard,
  AuthDivider,
  Button,
  LoadingButton,
  PasswordField,
} from "@/components/ui";
import { ApiClientError } from "@/lib/api/client";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handleGoogleCallback,
  handleGoogleLinkPasswordSubmit,
  handleGoogleStart,
} from "@/lib/auth/controllers";
import { AUTH_ROUTES } from "@/lib/auth/onboarding-routes";
import { useAuthFlowStore } from "@/lib/auth/state";
import {
  type GoogleLinkPasswordFormValues,
  googleLinkPasswordSchema,
} from "@/lib/auth/validation";

export function GoogleMarkIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

type GoogleScreenStatus =
  | "idle"
  | "starting"
  | "verifying_callback"
  | "link_required"
  | "denied"
  | "unavailable"
  | "invalid_callback";

export interface GoogleAuthScreenProps {
  mode?: "start" | "callback" | "link";
  initialCode?: string | null;
  initialState?: string | null;
  initialError?: string | null;
  initialReturnTo?: string | null;
  api?: AuthApiContract;
}

export function GoogleAuthScreen({
  mode = "start",
  initialCode,
  initialState,
  initialError,
  initialReturnTo,
  api,
}: GoogleAuthScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const storedLinkProofToken = useAuthFlowStore((state) => state.googleLinkProofToken);
  const storedReturnTo = useAuthFlowStore((state) => state.returnTo);
  const setReturnTo = useAuthFlowStore((state) => state.setReturnTo);
  const clearGoogleLinkProofToken = useAuthFlowStore(
    (state) => state.clearGoogleLinkProofToken,
  );

  const trimmedCode = (initialCode ?? "").trim();
  const trimmedState = (initialState ?? "").trim();
  const trimmedError = (initialError ?? "").trim();
  const hasCallbackParams =
    mode === "callback" ||
    trimmedCode.length > 0 ||
    trimmedState.length > 0 ||
    trimmedError.length > 0;

  const initialScreenStatus: GoogleScreenStatus = hasCallbackParams
    ? "verifying_callback"
    : mode === "link" || Boolean(storedLinkProofToken)
      ? "link_required"
      : "idle";

  const [status, setStatus] = useState<GoogleScreenStatus>(initialScreenStatus);
  const [linkProofToken, setLinkProofToken] = useState<string | null>(
    storedLinkProofToken,
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const callbackStartedRef = useRef(false);
  const submissionGuardRef = useRef(createSubmissionGuard());
  const startGuardRef = useRef(createSubmissionGuard());

  useEffect(() => {
    if (initialReturnTo !== undefined) {
      setReturnTo(initialReturnTo);
    }
  }, [initialReturnTo, setReturnTo]);

  useEffect(() => {
    if (!hasCallbackParams || callbackStartedRef.current) {
      return;
    }
    callbackStartedRef.current = true;

    let cancelled = false;
    const runCallback = async () => {
      setApiError(null);
      setStatus("verifying_callback");
      try {
        const outcome = await handleGoogleCallback(
          {
            code: trimmedCode,
            state: trimmedState,
            error: trimmedError,
          },
          {
            api,
            returnTo: initialReturnTo ?? storedReturnTo,
            cleanPathname: pathname || AUTH_ROUTES.GOOGLE_CALLBACK,
          },
        );
        if (cancelled) {
          return;
        }
        if (outcome.kind === "link_required") {
          setLinkProofToken(outcome.linkProofToken);
          setStatus("link_required");
          return;
        }
        setIsRedirecting(true);
        router.replace(outcome.destination);
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        if (trimmedError.length > 0) {
          setStatus("denied");
          setApiError("Google sign-in was cancelled or denied.");
          return;
        }
        if (error instanceof ApiClientError) {
          if (error.code === "GOOGLE_UNAVAILABLE") {
            setStatus("unavailable");
            setApiError(error.message);
            return;
          }
          setStatus("invalid_callback");
          setApiError(error.message);
        } else {
          setStatus("invalid_callback");
          setApiError("Google sign-in could not be completed. Please try again.");
        }
      }
    };

    void runCallback();
    return () => {
      cancelled = true;
    };
  }, [
    api,
    hasCallbackParams,
    initialReturnTo,
    pathname,
    router,
    storedReturnTo,
    trimmedCode,
    trimmedError,
    trimmedState,
  ]);

  const form = useForm<GoogleLinkPasswordFormValues>({
    resolver: zodResolver(googleLinkPasswordSchema),
    defaultValues: {
      password: "",
    },
  });

  const handleStartGoogle = async () => {
    await startGuardRef.current.run(async () => {
      setApiError(null);
      setStatus("starting");
      try {
        await handleGoogleStart({
          api,
          returnTo: initialReturnTo ?? storedReturnTo,
        });
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          if (error.code === "GOOGLE_UNAVAILABLE") {
            setStatus("unavailable");
          } else {
            setStatus("idle");
          }
          setApiError(error.message);
        } else {
          setStatus("idle");
          setApiError("Unable to start Google sign-in right now. Please try again.");
        }
      }
    });
  };

  const onSubmitLinkPassword = async (values: GoogleLinkPasswordFormValues) => {
    const activeToken = linkProofToken ?? storedLinkProofToken;
    await submissionGuardRef.current.run(async () => {
      setApiError(null);
      setIsSubmittingLink(true);
      try {
        const outcome = await handleGoogleLinkPasswordSubmit(activeToken, values, {
          api,
          returnTo: initialReturnTo ?? storedReturnTo,
        });
        setLinkProofToken(null);
        setIsRedirecting(true);
        router.replace(outcome.destination);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          if (error.code === "INVALID_PROOF") {
            setLinkProofToken(null);
            clearGoogleLinkProofToken();
            setStatus("invalid_callback");
          }
          setApiError(error.message);
        } else {
          setApiError("Unable to verify your password right now. Please try again.");
        }
      } finally {
        setIsSubmittingLink(false);
      }
    });
  };

  if (status === "verifying_callback") {
    return (
      <AuthCard
        title="Completing Google sign-in"
        subtitle="Verifying your Google account with Rekordly..."
      >
        <div
          className="flex flex-col items-center justify-center gap-3 py-6 text-center"
          role="status"
          aria-live="polite"
          data-testid="google-callback-loading"
        >
          <span
            aria-hidden="true"
            className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
          />
          <p className="font-sans text-sm text-text-secondary">
            Please wait while we verify your Google sign-in...
          </p>
        </div>
      </AuthCard>
    );
  }

  if (status === "link_required") {
    const isLinkLoading =
      isSubmittingLink || isRedirecting || form.formState.isSubmitting;

    return (
      <AuthCard
        title="Confirm your Rekordly password"
        subtitle="An account with this email already exists. Enter your Rekordly password once to link your Google account."
        alert={
          apiError ? (
            <Alert
              status="error"
              title="Unable to link account"
              description={apiError}
              onDismiss={() => setApiError(null)}
              data-testid="google-link-error"
            />
          ) : (
            <Alert
              status="info"
              title="Account verification required"
              description="Confirm your existing password to securely connect Google sign-in to your Rekordly account."
              data-testid="google-link-info"
            />
          )
        }
        footer={
          <div className="flex w-full items-center justify-between gap-4 pt-1">
            <Button
              variant="ghost"
              size="sm"
              isDisabled={isLinkLoading}
              startIcon={<ArrowLeft className="size-4" />}
              onPress={() => {
                setLinkProofToken(null);
                clearGoogleLinkProofToken();
                router.push(AUTH_ROUTES.LOGIN);
              }}
              className="px-2.5"
              data-testid="google-link-back-button"
            >
              Back to sign in
            </Button>

            <Link
              href={AUTH_ROUTES.FORGOT_PASSWORD}
              className="rounded-lg px-2 py-1 font-sans text-sm font-medium text-primary transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              data-testid="google-link-forgot-password"
            >
              Forgot password?
            </Link>
          </div>
        }
      >
        <form
          onSubmit={(event) => {
            void form.handleSubmit(onSubmitLinkPassword)(event);
          }}
          noValidate
          className="flex flex-col gap-4"
          data-testid="google-link-password-form"
        >
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <PasswordField
                id="google-link-password"
                name={field.name}
                label="Existing Rekordly password"
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
                isDisabled={isLinkLoading}
                isRequired
                isInvalid={Boolean(fieldState.error)}
                errorMessage={fieldState.error?.message}
                data-testid="google-link-password-input"
              />
            )}
          />

          <LoadingButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLinkLoading}
            loadingText={isRedirecting ? "Redirecting..." : "Linking account..."}
            startIcon={<Link2 className="size-4" />}
            data-testid="google-link-submit"
          >
            Confirm password & link Google
          </LoadingButton>
        </form>
      </AuthCard>
    );
  }

  if (status === "denied" || status === "unavailable" || status === "invalid_callback") {
    const title =
      status === "denied"
        ? "Google sign-in cancelled"
        : status === "unavailable"
          ? "Google sign-in unavailable"
          : "Unable to complete Google sign-in";

    const subtitle =
      status === "denied"
        ? "You cancelled Google sign-in before completing verification."
        : status === "unavailable"
          ? "Google sign-in is temporarily unavailable. You can continue with your email instead."
          : "This Google sign-in attempt has expired or is no longer valid.";

    return (
      <AuthCard
        title={title}
        subtitle={subtitle}
        alert={
          <Alert
            status={status === "denied" ? "warning" : "error"}
            title={title}
            description={
              apiError ??
              "Please try again or continue with your email address."
            }
            data-testid="google-auth-error-alert"
          />
        }
      >
        <div className="flex flex-col gap-3">
          <LoadingButton
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            startIcon={<RefreshCw className="size-4" />}
            onPress={() => {
              void handleStartGoogle();
            }}
            data-testid="google-retry-button"
          >
            Try Google sign-in again
          </LoadingButton>

          <Button
            type="button"
            variant="outline"
            size="md"
            fullWidth
            startIcon={<ArrowLeft className="size-4" />}
            onPress={() => {
              router.push(AUTH_ROUTES.LOGIN);
            }}
            data-testid="google-back-to-login-button"
          >
            Continue with email
          </Button>
        </div>
      </AuthCard>
    );
  }

  const isStarting = status === "starting";

  return (
    <AuthCard
      title="Continue with Google"
      subtitle="Sign in or create your Rekordly account using Google"
      alert={
        apiError ? (
          <Alert
            status="error"
            title="Unable to start Google sign-in"
            description={apiError}
            onDismiss={() => setApiError(null)}
            data-testid="google-start-error"
          />
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        <LoadingButton
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isStarting}
          loadingText="Connecting to Google..."
          startIcon={<GoogleMarkIcon className="size-4" />}
          onPress={() => {
            void handleStartGoogle();
          }}
          data-testid="google-start-submit"
        >
          Continue with Google
        </LoadingButton>

        <AuthDivider label="or" />

        <Button
          type="button"
          variant="outline"
          size="md"
          fullWidth
          isDisabled={isStarting}
          startIcon={<ArrowLeft className="size-4" />}
          onPress={() => {
            router.push(AUTH_ROUTES.LOGIN);
          }}
          data-testid="google-start-back-button"
        >
          Continue with email
        </Button>
      </div>
    </AuthCard>
  );
}
