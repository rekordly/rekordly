"use client";

import { ArrowLeft, ArrowRight, Password } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AuthCard } from "@/components/ui/auth-card";
import { authApi, type OtpPurpose } from "@/lib/auth";
import { createSubmissionGuard, handleOtpVerifySubmit } from "@/stores/auth-store";
import { ApiClientError } from "@/lib/errors";

export function OtpCard({
  email,
  purpose,
  title,
  onBack,
  backLabel,
}: {
  email: string;
  purpose: OtpPurpose;
  title: string;
  onBack: () => void;
  backLabel: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [apiError, setApiError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const guard = useRef(createSubmissionGuard());

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setCodeError("Enter the 6-digit code");
      return;
    }
    await guard.current.run(async () => {
      setApiError(null);
      setNotice(null);
      setIsBusy(true);
      try {
        const outcome = await handleOtpVerifySubmit(email, purpose, code);
        router.push(outcome.destination);
      } catch (error: unknown) {
        setApiError(
          error instanceof ApiClientError
            ? "That code is incorrect or has expired. Check it or request a new one."
            : "Unable to verify the code right now. Please try again.",
        );
        setIsBusy(false);
      }
    });
  };

  const resend = async () => {
    setApiError(null);
    try {
      await authApi.requestOtp(email, purpose);
      setNotice("If the request is eligible, a new code will be sent.");
    } catch {
      setApiError("Unable to send a new code right now. Please try again.");
    }
  };

  return (
    <AuthCard
      title={title}
      subtitle={
        <>
          Enter the 6-digit code we sent to <span className="text-foreground">{email}</span>
        </>
      }
      alert={
        apiError ? (
          <Alert status="error" title="Could not verify" description={apiError} onDismiss={() => setApiError(null)} />
        ) : notice ? (
          <Alert status="success" title="Check your email" description={notice} onDismiss={() => setNotice(null)} />
        ) : null
      }
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <AppButton variant="ghost" size="sm" startContent={<ArrowLeft />} onPress={onBack} label={backLabel} />
          <button
            type="button"
            onClick={() => void resend()}
            className="cursor-pointer text-[13px] font-medium text-link hover:underline"
          >
            Resend code
          </button>
        </div>
      }
    >
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        <AppInput
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          isRequired
          autoFocus
          placeholder="6-digit code"
          startContent={<Password />}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
            setCodeError(undefined);
          }}
          errorMessage={codeError}
          isDisabled={isBusy}
        />
        <AppButton type="submit" size="md" fullWidth isLoading={isBusy} endContent={<ArrowRight weight="bold" />}>
          {isBusy ? "Verifying..." : "Verify and continue"}
        </AppButton>
      </form>
    </AuthCard>
  );
}
