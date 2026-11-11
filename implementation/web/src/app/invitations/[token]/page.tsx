"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Buildings, CheckCircle, Warning, Envelope, ArrowRight } from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { Alert } from "@/components/ui/alert";
import { invitationApi, type InvitationSummary } from "@/lib/auth";
import { useAuthStore } from "@/stores/auth-store";

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [invitation, setInvitation] = useState<InvitationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    invitationApi
      .inspect(token)
      .then((data) => {
        if (active) {
          setInvitation(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "This invitation is invalid or has expired.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleAcceptLoggedIn = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await invitationApi.accept(token);
      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation.");
      setSubmitting(false);
    }
  };

  const handleRequestOTP = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await invitationApi.requestOTP(token);
      setOtpStep(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send verification code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 6) {
      setError("Please enter the 6-digit verification code");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await invitationApi.verifyOTP(token, otpCode);
      if (res.onboarding_status === "completed") {
        router.push("/dashboard");
      } else {
        router.push("/create-password");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid or expired verification code.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border/80 bg-surface p-8 shadow-sm">
        {/* Brand Header */}
        <div className="flex items-center gap-3 border-b border-border/50 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Buildings size={22} weight="duotone" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold text-foreground">Workspace Invitation</h1>
            <p className="text-xs text-muted">Join a collaborative finance workspace on Rekordly</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted">Verifying invitation link...</p>
          </div>
        ) : error && !invitation ? (
          <div className="space-y-4">
            <Alert status="error" description={error} />
            <AppButton variant="secondary" label="Return to Sign In" onPress={() => router.push("/login")} />
          </div>
        ) : success ? (
          <div className="space-y-4 text-center py-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle size={28} weight="duotone" />
            </div>
            <h2 className="font-heading text-base font-bold text-foreground">Invitation Accepted!</h2>
            <p className="text-xs text-muted">You now have access to {invitation?.workspace_name}. Redirecting...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {error && <Alert status="error" description={error} />}

            <div className="rounded-2xl border border-border/60 bg-surface-secondary/40 p-4 space-y-2">
              <div className="text-xs text-muted">You have been invited to join:</div>
              <div className="text-base font-bold text-foreground">{invitation?.workspace_name}</div>
              <div className="flex items-center gap-2 pt-1 text-xs text-muted">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary capitalize">
                  {invitation?.role_name || "Member"}
                </span>
                <span>•</span>
                <span>Sent to {invitation?.destination}</span>
              </div>
            </div>

            {user ? (
              <div className="space-y-4">
                <p className="text-xs text-muted">
                  You are signed in. Click below to accept the invitation and link this workspace to your account.
                </p>
                <AppButton
                  label="Accept & Join Workspace"
                  isLoading={submitting}
                  onPress={handleAcceptLoggedIn}
                  endContent={<ArrowRight weight="bold" />}
                />
              </div>
            ) : !otpStep ? (
              <div className="space-y-4">
                <p className="text-xs text-muted">
                  To accept this invitation, verify that you own {invitation?.destination}. We will send a 6-digit confirmation code.
                </p>
                <AppButton
                  label="Send Verification Code"
                  isLoading={submitting}
                  onPress={handleRequestOTP}
                  startContent={<Envelope weight="bold" />}
                />
              </div>
            ) : (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <AppInput
                  label="6-Digit Verification Code"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={6}
                  isRequired
                  description={`Enter the 6-digit code sent to ${invitation?.destination}`}
                />
                <div className="flex gap-2">
                  <AppButton
                    variant="ghost"
                    label="Back"
                    onPress={() => setOtpStep(false)}
                    isDisabled={submitting}
                  />
                  <AppButton
                    type="submit"
                    label="Verify & Join"
                    isLoading={submitting}
                  />
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
