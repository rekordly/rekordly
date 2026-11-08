"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, KeyRound, MailCheck, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
import { NEUTRAL_OTP_REQUEST_MESSAGE } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/client";
import type { OtpPurpose } from "@/lib/api/types";
import { getFormFieldAccessibilityIds } from "@/lib/auth/accessibility";
import {
  type AuthApiContract,
  createSubmissionGuard,
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  handleOtpRequestSubmit,
  handleOtpVerifySubmit,
} from "@/lib/auth/controllers";
import { AUTH_ROUTES } from "@/lib/auth/onboarding-routes";
import { maskEmailAddress, useAuthFlowStore } from "@/lib/auth/state";
import {
  applyOtpSlotInput,
  OTP_CODE_LENGTH,
  type OtpVerifyFormValues,
  otpVerifySchema,
  splitOtpIntoSlots,
} from "@/lib/auth/validation";

export interface OtpVerificationScreenProps {
  initialEmail?: string;
  initialPurpose?: OtpPurpose;
  initialCooldownSeconds?: number;
  onBackToEmail?: () => void;
  api?: AuthApiContract;
}

export function OtpVerificationScreen({
  initialEmail,
  initialPurpose,
  initialCooldownSeconds = DEFAULT_RESEND_COOLDOWN_SECONDS,
  onBackToEmail,
  api,
}: OtpVerificationScreenProps) {
  const router = useRouter();
  const storedEmail = useAuthFlowStore((state) => state.email);
  const storedPurpose = useAuthFlowStore((state) => state.otpPurpose);
  const storedContinuation = useAuthFlowStore((state) => state.continuation);
  const otpGeneration = useAuthFlowStore((state) => state.otpGeneration);
  const setEmail = useAuthFlowStore((state) => state.setEmail);

  const resolvedPurpose: OtpPurpose =
    initialPurpose ??
    storedPurpose ??
    (storedContinuation === "registration" ? "registration" : "sign_in");

  const resolvedInitialEmail = (initialEmail ?? storedEmail ?? "").trim();

  const [slots, setSlots] = useState<string[]>(() => splitOtpIntoSlots(""));
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(
    resolvedInitialEmail ? initialCooldownSeconds : 0,
  );
  const [statusNotice, setStatusNotice] = useState<string | null>(
    resolvedInitialEmail ? NEUTRAL_OTP_REQUEST_MESSAGE : null,
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const verifyGuardRef = useRef(createSubmissionGuard());
  const resendGuardRef = useRef(createSubmissionGuard());
  const slotRefs = useRef<Array<HTMLInputElement | null>>([]);

  const baseId = useId();
  const groupFieldId = `otp-code-${baseId}`;

  const form = useForm<OtpVerifyFormValues>({
    resolver: zodResolver(otpVerifySchema),
    defaultValues: {
      email: resolvedInitialEmail,
      purpose: resolvedPurpose,
      code: "",
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

  const syncCodeSlots = (nextSlots: string[], nextFocusIndex?: number) => {
    setSlots(nextSlots);
    const joined = nextSlots.join("");
    form.setValue("code", joined, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: joined.length === OTP_CODE_LENGTH,
    });
    if (apiError) {
      setApiError(null);
      setErrorCode(null);
    }
    if (typeof nextFocusIndex === "number") {
      const target = slotRefs.current[nextFocusIndex];
      if (target) {
        target.focus();
      }
    }
  };

  const handleSlotChange = (index: number, rawValue: string) => {
    const result = applyOtpSlotInput(slots, index, rawValue);
    syncCodeSlots(
      result.slots,
      rawValue.length > 0 ? result.nextFocusIndex : undefined,
    );
  };

  const handleSlotPaste = (
    index: number,
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pasted = event.clipboardData.getData("text");
    if (!pasted) {
      return;
    }
    event.preventDefault();
    const result = applyOtpSlotInput(slots, index, pasted);
    syncCodeSlots(result.slots, result.nextFocusIndex);
  };

  const handleSlotKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace") {
      if (slots[index]) {
        event.preventDefault();
        const next = [...slots];
        next[index] = "";
        syncCodeSlots(next, index);
        return;
      }
      if (index > 0) {
        event.preventDefault();
        const prevIndex = index - 1;
        const next = [...slots];
        next[prevIndex] = "";
        syncCodeSlots(next, prevIndex);
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      slotRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowRight" && index < OTP_CODE_LENGTH - 1) {
      event.preventDefault();
      slotRefs.current[index + 1]?.focus();
    }
  };

  const onSubmit = async (values: OtpVerifyFormValues) => {
    await verifyGuardRef.current.run(async () => {
      setApiError(null);
      setErrorCode(null);
      setStatusNotice(null);
      setIsVerifying(true);
      try {
        const outcome = await handleOtpVerifySubmit(values, { api });
        setIsRedirecting(true);
        router.push(outcome.destination);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setErrorCode(error.code);
          if (error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
            setCooldownSeconds(error.retryAfterSeconds);
          }
          if (error.code === "INVALID_PROOF") {
            setApiError(
              "That verification code is invalid, expired, or has already been used. Check your latest email or request a new code.",
            );
          } else {
            setApiError(error.message);
          }
        } else {
          setApiError("Unable to verify the code right now. Please try again.");
        }
      } finally {
        setIsVerifying(false);
      }
    });
  };

  const handleResendCode = async () => {
    if (cooldownSeconds > 0) {
      return;
    }
    const emailCandidate = form.getValues("email").trim();
    const emailCheck = await form.trigger("email");
    if (!emailCheck || !emailCandidate) {
      return;
    }

    await resendGuardRef.current.run(async () => {
      setApiError(null);
      setErrorCode(null);
      setIsResending(true);
      try {
        const outcome = await handleOtpRequestSubmit(
          {
            email: emailCandidate,
            purpose: form.getValues("purpose"),
          },
          api,
        );
        // Generation-safe reset: clear any digits from superseded challenge generation
        const emptySlots = splitOtpIntoSlots("");
        setSlots(emptySlots);
        form.setValue("code", "", { shouldValidate: false });
        setCooldownSeconds(outcome.cooldownSeconds);
        setStatusNotice(
          `${outcome.message} Any previous verification code has been invalidated.`,
        );
        slotRefs.current[0]?.focus();
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          setErrorCode(error.code);
          if (error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
            setCooldownSeconds(error.retryAfterSeconds);
          }
          setApiError(error.message);
        } else {
          setApiError("Unable to request a new code right now. Please try again.");
        }
      } finally {
        setIsResending(false);
      }
    });
  };

  const handleSwitchEmail = () => {
    const currentEmail = form.getValues("email").trim();
    if (currentEmail) {
      setEmail(currentEmail);
    }
    if (onBackToEmail) {
      onBackToEmail();
      return;
    }
    router.push(AUTH_ROUTES.LOGIN);
  };

  const codeFieldError = form.formState.errors.code?.message;
  const hasCodeError = Boolean(codeFieldError) || errorCode === "INVALID_PROOF";
  const { labelId, descriptionId, errorId, ariaDescribedBy } =
    getFormFieldAccessibilityIds(groupFieldId, {
      hasDescription: true,
      hasError: Boolean(codeFieldError),
    });

  const isLoading =
    isVerifying || isResending || isRedirecting || form.formState.isSubmitting;

  const isRegistration = resolvedPurpose === "registration";

  return (
    <AuthCard
      title={isRegistration ? "Verify your email" : "Enter verification code"}
      subtitle={
        currentEmailValue ? (
          <>
            Enter the 6-digit single-use code sent to{" "}
            <span className="font-semibold text-foreground">
              {currentEmailValue}
            </span>{" "}
            ({maskEmailAddress(currentEmailValue)}).
          </>
        ) : (
          "Enter your email address and the 6-digit verification code sent to your inbox."
        )
      }
      alert={
        apiError ? (
          <Alert
            status={errorCode === "RATE_LIMITED" ? "warning" : "error"}
            title={
              errorCode === "RATE_LIMITED"
                ? "Too many verification attempts"
                : "Verification failed"
            }
            description={apiError}
            onDismiss={() => {
              setApiError(null);
              setErrorCode(null);
            }}
            data-testid="otp-error-alert"
          />
        ) : statusNotice ? (
          <Alert
            status="info"
            title={
              isRegistration
                ? "Email verification required"
                : "Verification code requested"
            }
            description={statusNotice}
            onDismiss={() => setStatusNotice(null)}
            data-testid="otp-status-notice"
          />
        ) : null
      }
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button
            variant="ghost"
            size="md"
            fullWidth
            isDisabled={isLoading}
            startIcon={<ArrowLeft className="size-4" />}
            onPress={handleSwitchEmail}
            data-testid="otp-change-email-button"
          >
            Use a different email address
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <StatusBadge tone={isRegistration ? "primary" : "secondary"}>
          <MailCheck className="size-3.5" aria-hidden="true" />
          <span>
            {isRegistration ? "New account verification" : "Sign-in code"}
          </span>
        </StatusBadge>
        {otpGeneration > 1 ? (
          <span
            className="font-mono text-xs text-muted-foreground"
            data-testid="otp-generation-indicator"
          >
            Code #{otpGeneration}
          </span>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
        noValidate
        className="flex flex-col gap-4"
        data-testid="otp-verify-form"
      >
        {!resolvedInitialEmail ? (
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                id="otp-email"
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
                    setErrorCode(null);
                  }
                }}
                onBlur={field.onBlur}
                inputRef={field.ref}
                isDisabled={isLoading}
                isRequired
                isInvalid={Boolean(fieldState.error)}
                errorMessage={fieldState.error?.message}
                data-testid="otp-email-input"
              />
            )}
          />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              id={labelId}
              htmlFor={`${groupFieldId}-slot-0`}
              className="font-sans text-sm font-medium text-foreground"
            >
              6-digit verification code
              <span className="ml-0.5 text-danger" aria-hidden="true">
                *
              </span>
            </label>
          </div>

          <div
            role="group"
            aria-labelledby={labelId}
            aria-describedby={ariaDescribedBy}
            className="grid grid-cols-6 gap-2 sm:gap-2.5"
            data-testid="otp-digit-group"
          >
            {slots.map((digit, index) => (
              <input
                key={`${groupFieldId}-slot-${index}`}
                ref={(el) => {
                  slotRefs.current[index] = el;
                }}
                id={`${groupFieldId}-slot-${index}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={OTP_CODE_LENGTH}
                autoComplete={index === 0 ? "one-time-code" : "off"}
                value={digit}
                disabled={isLoading}
                aria-label={`Verification code digit ${index + 1} of ${OTP_CODE_LENGTH}`}
                aria-invalid={hasCodeError || undefined}
                aria-describedby={ariaDescribedBy}
                onChange={(event) => handleSlotChange(index, event.target.value)}
                onPaste={(event) => handleSlotPaste(index, event)}
                onKeyDown={(event) => handleSlotKeyDown(index, event)}
                data-testid={`otp-digit-${index}`}
                className="flex h-12 min-w-0 w-full items-center justify-center rounded-xl border border-border bg-[var(--field-background)] text-center font-mono text-base font-semibold text-foreground transition-colors focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger"
              />
            ))}
          </div>

          <p
            id={descriptionId}
            className="font-sans text-xs leading-relaxed text-muted-foreground"
          >
            Code expires in 10 minutes. You can type or paste all 6 digits directly.
          </p>

          {codeFieldError ? (
            <p
              id={errorId}
              role="alert"
              className="font-sans text-xs font-medium leading-relaxed text-danger"
              data-testid="otp-code-field-error"
            >
              {codeFieldError}
            </p>
          ) : null}
        </div>

        <LoadingButton
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isVerifying || isRedirecting}
          loadingText={isRedirecting ? "Continuing..." : "Verifying code..."}
          data-testid="otp-verify-submit"
        >
          {isRegistration ? "Verify email & continue" : "Verify & sign in"}
        </LoadingButton>
      </form>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-sans text-xs font-medium text-foreground">
            Didn&apos;t receive a code?
          </span>
          <span
            className="font-sans text-xs text-muted-foreground"
            data-testid="otp-cooldown-status"
          >
            {cooldownSeconds > 0
              ? `Resend available in ${cooldownSeconds}s`
              : "Request a fresh single-use code"}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          isDisabled={cooldownSeconds > 0 || isLoading}
          startIcon={<RefreshCw className="size-3.5" />}
          onPress={() => {
            void handleResendCode();
          }}
          data-testid="otp-resend-button"
        >
          {isResending
            ? "Sending..."
            : cooldownSeconds > 0
              ? `Resend (${cooldownSeconds}s)`
              : "Resend code"}
        </Button>
      </div>

      {!isRegistration ? (
        <>
          <AuthDivider label="or" />
          <div className="flex flex-col gap-2.5">
            <Link
              href={AUTH_ROUTES.LOGIN_PASSWORD}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 font-sans text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              data-testid="otp-switch-to-password-link"
            >
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              <span>Sign in with password</span>
            </Link>
            <Link
              href={AUTH_ROUTES.LOGIN_MAGIC}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 font-sans text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              data-testid="otp-switch-to-magic-link"
            >
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              <span>Email me a magic link</span>
            </Link>
          </div>
        </>
      ) : null}
    </AuthCard>
  );
}
