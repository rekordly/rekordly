"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  Alert,
  AuthCard,
  Button,
  LoadingButton,
  PasswordField,
} from "@/components/ui";
import { ApiClientError } from "@/lib/api";
import {
  type AuthApiContract,
  createSubmissionGuard,
  handleCreateFirstPasswordSubmit,
} from "@/lib/auth-flow";
import { AUTH_ROUTES } from "@/lib/auth-routes";
import { useAuthFlowStore } from "@/stores/auth-flow-store";
import {
  type CreatePasswordFormValues,
  createPasswordSchema,
  MAX_PASSWORD_UTF8_BYTES,
  MIN_PASSWORD_UTF8_BYTES,
} from "@/lib/validation";

export interface CreatePasswordScreenProps {
  initialPreAuthToken?: string | null;
  api?: AuthApiContract;
}

export function CreatePasswordScreen({
  initialPreAuthToken,
  api,
}: CreatePasswordScreenProps) {
  const router = useRouter();
  const storePreAuthToken = useAuthFlowStore((state) => state.preAuthToken);
  const storedEmail = useAuthFlowStore((state) => state.email);
  const clearPreAuthToken = useAuthFlowStore((state) => state.clearPreAuthToken);

  const activePreAuthToken = (initialPreAuthToken ?? storePreAuthToken ?? "").trim();

  const [proofLost, setProofLost] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const submissionGuardRef = useRef(createSubmissionGuard());

  const form = useForm<CreatePasswordFormValues>({
    resolver: zodResolver(createPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: CreatePasswordFormValues) => {
    await submissionGuardRef.current.run(async () => {
      setApiError(null);
      setIsBusy(true);
      try {
        const outcome = await handleCreateFirstPasswordSubmit(
          activePreAuthToken,
          values,
          { api },
        );
        setIsRedirecting(true);
        router.push(outcome.destination);
      } catch (error: unknown) {
        if (error instanceof ApiClientError) {
          if (error.code === "INVALID_PROOF") {
            clearPreAuthToken();
            setProofLost(true);
          }
          setApiError(error.message);
        } else {
          setApiError("Unable to save your password right now. Please try again.");
        }
      } finally {
        setIsBusy(false);
      }
    });
  };

  const isLoading = isBusy || isRedirecting || form.formState.isSubmitting;
  const isMissingProof = !activePreAuthToken || proofLost;

  if (isMissingProof) {
    return (
      <AuthCard
        title="Restart verification"
        subtitle="Your verification session has expired"
        alert={
          <Alert
            status="warning"
            title="Verification expired"
            description={
              apiError ??
              "Return to sign in and verify your email again."
            }
            data-testid="create-password-restart-state"
          />
        }
      >
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            startIcon={<ArrowLeft className="size-4" />}
            onPress={() => router.push(AUTH_ROUTES.LOGIN)}
            data-testid="create-password-restart-button"
          >
            Verify again
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your password"
      subtitle={
        storedEmail ? (
          <>
            Set a password for{" "}
            <span className="font-semibold text-foreground">{storedEmail}</span>
          </>
        ) : (
          "Set a password for your account"
        )
      }
      alert={
        apiError ? (
          <Alert
            status="error"
            title="Could not create password"
            description={apiError}
            onDismiss={() => setApiError(null)}
            data-testid="create-password-error"
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
        data-testid="create-password-form"
      >
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <PasswordField
              id="create-password"
              name={field.name}
              label="Password"
              autoComplete="new-password"
              placeholder="At least 10 characters"
              description={`${MIN_PASSWORD_UTF8_BYTES}–${MAX_PASSWORD_UTF8_BYTES} characters. A passphrase works well.`}
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
              data-testid="create-password-input"
            />
          )}
        />

        <Controller
          control={form.control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <PasswordField
              id="create-confirm-password"
              name={field.name}
              label="Confirm password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
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
              data-testid="create-confirm-password-input"
            />
          )}
        />

        <LoadingButton
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isLoading}
          loadingText={isRedirecting ? "Redirecting..." : "Creating password..."}
          data-testid="create-password-submit"
        >
          Create password
        </LoadingButton>
      </form>
    </AuthCard>
  );
}
