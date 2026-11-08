"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  MailCheck,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import {
  Alert,
  AuthCard,
  AuthDivider,
  Button,
  LoadingButton,
  StatusBadge,
  TextField,
} from "@/components/ui";
import { NEUTRAL_MAGIC_LINK_REQUEST_MESSAGE } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/client";
import {
  type AuthApiContract,
  createSubmissionGuard,
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  handleMagicLinkConfirmSubmit,
  handleMagicLinkInspect,
  handleMagicLinkRequestSubmit,
} from "@/lib/auth/controllers";
import { AUTH_ROUTES } from "@/lib/auth/onboarding-routes";
import { maskEmailAddress, useAuthFlowStore } from "@/lib/auth/state";
import {
  type MagicLinkRequestFormValues,
  magicLinkRequestSchema,
} from "@/lib/auth/validation";

export interface MagicLinkScreenProps {
  initialToken?: string | null;
  initialEmail?: string;
  initialRequested?: boolean;
  cleanPathname?: string;
  api?: AuthApiContract;
}

type TokenFlowStage = "idle" | "inspecting" | "ready" | "invalid" | "rate_limited";

export function MagicLinkScreen({
  initialToken,
  initialEmail,
  initialRequested = false,
  cleanPathname = AUTH_ROUTES.AUTH_MAGIC,
  api,
}: MagicLinkScreenProps) {
  const router = useRouter();
  const storedEmail = useAuthFlowStore((state) => state.email);
  const magicLinkGeneration = useAuthFlowStore((state) => state.magicLinkGeneration);
  const setEmail = useAuthFlowStore((state) => state.setEmail);

  const trimmedInitialToken = (initialToken ?? "").trim();
  const hasInitialToken = trimmedInitialToken.length > 0;
  const tokenRef = useRef<string>(trimmedInitialToken);

  const [tokenStage, setTokenStage] = useState<TokenFlowStage>(
    hasInitialToken ? "inspecting" : "idle",
  );
  const [hasRequestedLink, setHasRequestedLink] = useState<boolean>(
    initialRequested || magicLinkGeneration > 0,
  );
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(
    initialRequested ? DEFAULT_RESEND_COOLDOWN_SECONDS : 0,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(
    initialRequested ? NEUTRAL_MAGIC_LINK_REQUEST_MESSAGE : null,
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const requestGuardRef = useRef(createSubmissionGuard());
  const confirmGuardRef = useRef(createSubmissionGuard());
  const inspectedOnceRef = useRef(false);

  const resolvedEmail = (initialEmail ?? storedEmail ?? "").trim();

  const form = useForm<MagicLinkRequestFormValues>({
    resolver: zodResolver(magicLinkRequestSchema),
    defaultValues: {
      email: resolvedEmail,
    },
  });

  const currentEmailValue = useWatch({
    control: form.control,
    name: "email",
  });

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (!hasInitialToken || inspectedOnceRef.current) {
      return;
    }
    inspectedOnceRef.current = true;

    let cancelled = false;
    const runInspection = async () => {
      setTokenStage("inspecting");
      setApiError(null);
      try {
        await handleMagicLinkInspect(tokenRef.current, {
          api,
          cleanPathname,
        });
        if (!cancelled) {
          setTokenStage("ready");
        }
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiClientError) {
          if (error.code === "RATE_LIMITED") {
            setTokenStage("rate_limited");
            if (error.retryAfterSeconds) {
              setCooldownSeconds(error.retryAfterSeconds);
            }
            setApiError(error.message);
            return;
          }
          setTokenStage("invalid");
          setApiError(
            "This sign-in link is invalid, expired, or has already been used. Request a fresh sign-in link to continue.",
          );
          return;
        }
        setTokenStage("invalid");
        setApiError(
          "This sign-in link could not be verified. Please request a new sign-in link.",
        );
      }
    };

    void runInspection();
    return () => {
      cancelled = true;
    };
  }, [api, cleanPathname, hasInitialToken]);

  const handleConfirmMagicLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await confirmGuardRef.current.run(async () => {
      setApiError(null);
      setIsBusy(true);
      try {
        const outcome = await handleMagicLinkConfirmSubmit(tokenRef.current, {
          api,
          cleanPathname,
          onTokenConsumed: () => {
            tokenRef.current = "";
          },
        });
        tokenRef.current = "";
        setIsRedirecting(true);
        router.push(outcome.destination);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          if (error.code === "RATE_LIMITED") {
            setTokenStage("rate_limited");
            if (error.retryAfterSeconds) {
              setCooldownSeconds(error.retryAfterSeconds);
            }
            setApiError(error.message);
            return;
          }
          tokenRef.current = "";
          setTokenStage("invalid");
          setApiError(
            "This sign-in link is invalid, expired, or has already been used. Please request a new sign-in link.",
          );
        } else {
          setApiError("Unable to complete sign-in right now. Please try again.");
        }
      } finally {
        setIsBusy(false);
      }
    });
  };

  const onRequestSubmit = async (values: MagicLinkRequestFormValues) => {
    if (cooldownSeconds > 0) {
      return;
    }
    await requestGuardRef.current.run(async () => {
      setApiError(null);
      setIsBusy(true);
      try {
        const outcome = await handleMagicLinkRequestSubmit(values, { api });
        setHasRequestedLink(true);
        setCooldownSeconds(outcome.cooldownSeconds);
        setStatusMessage(
          outcome.generation > 1
            ? `${outcome.message} Any previous sign-in link has been invalidated.`
            : outcome.message,
        );
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          if (error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
            setCooldownSeconds(error.retryAfterSeconds);
          }
          setApiError(error.message);
        } else {
          setApiError("Unable to send a sign-in link right now. Please try again.");
        }
      } finally {
        setIsBusy(false);
      }
    });
  };

  const handleSwitchToRequestMode = () => {
    tokenRef.current = "";
    setApiError(null);
    setTokenStage("idle");
  };

  // 1. Non-consuming inspection loading state
  if (tokenStage === "inspecting") {
    return (
      <AuthCard
        title="Verifying sign-in link"
        subtitle="Checking that your single-use Rekordly sign-in link is valid and active."
      >
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-6 text-center shadow-2xs"
          role="status"
          aria-live="polite"
          data-testid="magic-link-inspecting-state"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <p className="font-sans text-sm font-medium text-foreground">
            Inspecting your magic link...
          </p>
          <p className="font-sans text-xs text-muted-foreground">
            Your link has not been consumed yet. You will confirm sign-in on the next step.
          </p>
        </div>
      </AuthCard>
    );
  }

  // 2. Explicit confirmation action after non-consuming inspection succeeds
  if (tokenStage === "ready") {
    const isConfirmLoading = isBusy || isRedirecting;
    return (
      <AuthCard
        title="Confirm your sign-in"
        subtitle="Your single-use sign-in link is valid. Confirm below to sign in to Rekordly."
        alert={
          apiError ? (
            <Alert
              status="error"
              title="Could not complete sign-in"
              description={apiError}
              onDismiss={() => setApiError(null)}
              data-testid="magic-link-confirm-error"
            />
          ) : (
            <Alert
              status="info"
              title="Confirmation required"
              description="To protect your account from automated email scanners, sign-in links only complete when you press the confirmation button below."
              data-testid="magic-link-scanner-notice"
            />
          )
        }
        footer={
          <Button
            variant="ghost"
            size="md"
            fullWidth
            isDisabled={isConfirmLoading}
            startIcon={<ArrowLeft className="size-4" />}
            onPress={() => router.push(AUTH_ROUTES.LOGIN)}
            data-testid="magic-link-cancel-button"
          >
            Back to sign in
          </Button>
        }
      >
        <form
          onSubmit={(event) => {
            void handleConfirmMagicLink(event);
          }}
          className="flex flex-col gap-4"
          data-testid="magic-link-confirm-form"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Ready to continue
              </h2>
              <p className="font-sans text-xs leading-relaxed text-muted-foreground">
                Confirming will consume this single-use link and open your Rekordly workspace (or prompt you to set a password if your account does not have one yet).
              </p>
            </div>
          </div>

          <LoadingButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isConfirmLoading}
            loadingText={isRedirecting ? "Redirecting..." : "Confirming sign-in..."}
            data-testid="magic-link-confirm-submit"
          >
            Confirm &amp; sign in
          </LoadingButton>
        </form>
      </AuthCard>
    );
  }

  // 3. Invalid, expired, consumed, or rate-limited token state
  if (tokenStage === "invalid" || tokenStage === "rate_limited") {
    return (
      <AuthCard
        title={
          tokenStage === "rate_limited"
            ? "Too many attempts"
            : "Sign-in link expired or used"
        }
        subtitle="Each sign-in link can only be used once and expires after 15 minutes."
        alert={
          <Alert
            status={tokenStage === "rate_limited" ? "warning" : "error"}
            title={
              tokenStage === "rate_limited"
                ? "Please wait before retrying"
                : "Sign-in link is no longer valid"
            }
            description={
              apiError ??
              "This sign-in link is invalid, expired, or has already been used. Request a fresh link to sign in."
            }
            data-testid="magic-link-invalid-alert"
          />
        }
        footer={
          <Button
            variant="ghost"
            size="md"
            fullWidth
            startIcon={<ArrowLeft className="size-4" />}
            onPress={() => router.push(AUTH_ROUTES.LOGIN)}
            data-testid="magic-link-invalid-back-button"
          >
            Back to sign in
          </Button>
        }
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary-soft text-secondary">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Need a fresh sign-in link?
              </h2>
              <p className="font-sans text-xs leading-relaxed text-muted-foreground">
                Requesting a new link automatically invalidates older links sent to your inbox.
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleSwitchToRequestMode}
            data-testid="magic-link-request-new-button"
          >
            Request a new sign-in link
          </Button>
        </div>
      </AuthCard>
    );
  }

  // 4. Magic-link request / requested screen
  const isRequestLoading = isBusy || form.formState.isSubmitting;

  return (
    <AuthCard
      title={hasRequestedLink ? "Check your email" : "Email me a sign-in link"}
      subtitle={
        hasRequestedLink && currentEmailValue ? (
          <>
            {NEUTRAL_MAGIC_LINK_REQUEST_MESSAGE} Target:{" "}
            <span className="font-semibold text-foreground">
              {currentEmailValue}
            </span>{" "}
            ({maskEmailAddress(currentEmailValue)}).
          </>
        ) : (
          "We will send a single-use sign-in link to your verified email address."
        )
      }
      alert={
        apiError ? (
          <Alert
            status="error"
            title="Could not send sign-in link"
            description={apiError}
            onDismiss={() => setApiError(null)}
            data-testid="magic-link-request-error"
          />
        ) : statusMessage ? (
          <Alert
            status="success"
            title="Sign-in link requested"
            description={statusMessage}
            onDismiss={() => setStatusMessage(null)}
            data-testid="magic-link-requested-alert"
          />
        ) : null
      }
      footer={
        <Button
          variant="ghost"
          size="md"
          fullWidth
          isDisabled={isRequestLoading}
          startIcon={<ArrowLeft className="size-4" />}
          onPress={() => {
            const trimmed = form.getValues("email").trim();
            if (trimmed) {
              setEmail(trimmed);
            }
            router.push(AUTH_ROUTES.LOGIN);
          }}
          data-testid="magic-link-back-to-login-button"
        >
          Use a different email address
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <StatusBadge tone="primary">
          <MailCheck className="size-3.5" aria-hidden="true" />
          <span>Single-use magic link</span>
        </StatusBadge>
        {magicLinkGeneration > 1 ? (
          <span
            className="font-mono text-xs text-muted-foreground"
            data-testid="magic-link-generation-indicator"
          >
            Link #{magicLinkGeneration}
          </span>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          void form.handleSubmit(onRequestSubmit)(event);
        }}
        noValidate
        className="flex flex-col gap-4"
        data-testid="magic-link-request-form"
      >
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              id="magic-link-email"
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
              isDisabled={isRequestLoading}
              isRequired
              isInvalid={Boolean(fieldState.error)}
              errorMessage={fieldState.error?.message}
              data-testid="magic-link-email-input"
            />
          )}
        />

        <LoadingButton
          type="submit"
          variant={hasRequestedLink ? "outline" : "primary"}
          size="lg"
          fullWidth
          isDisabled={cooldownSeconds > 0}
          isLoading={isRequestLoading}
          loadingText="Sending sign-in link..."
          startIcon={hasRequestedLink ? <RefreshCw className="size-4" /> : undefined}
          data-testid="magic-link-request-submit"
        >
          {cooldownSeconds > 0
            ? `Resend link in ${cooldownSeconds}s`
            : hasRequestedLink
              ? "Resend sign-in link"
              : "Send sign-in link"}
        </LoadingButton>
      </form>

      <AuthDivider label="or" />

      <div className="flex flex-col gap-2.5">
        <Link
          href={AUTH_ROUTES.LOGIN_PASSWORD}
          onClick={() => {
            const trimmed = form.getValues("email").trim();
            if (trimmed) {
              setEmail(trimmed);
            }
          }}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 font-sans text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          data-testid="magic-link-switch-to-password"
        >
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          <span>Sign in with password</span>
        </Link>

        <Link
          href={AUTH_ROUTES.LOGIN_OTP}
          onClick={() => {
            const trimmed = form.getValues("email").trim();
            if (trimmed) {
              setEmail(trimmed);
            }
          }}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 font-sans text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          data-testid="magic-link-switch-to-otp"
        >
          <MailCheck className="size-4 text-primary" aria-hidden="true" />
          <span>Sign in with verification code</span>
        </Link>
      </div>
    </AuthCard>
  );
}
