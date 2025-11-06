'use client';

import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Divider } from '@heroui/divider';
import { Alert } from '@heroui/alert';
import { FcGoogle } from 'react-icons/fc';
import { FaXTwitter, FaApple, FaLock } from 'react-icons/fa6';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import type { withEmailType } from '@/types/auth.types';
import { withEmailSchema } from '@/lib/validations/auth.schema';
import { getAlertColor } from '@/lib/fn';
import { useState } from 'react';

interface EmailScreenProps {
  onPasswordClick: () => void;
  onEmailSuccess: () => void;
  initialError?: string | null;
}

type alertType = 'success' | 'error' | 'warning' | 'info';

export function EmailScreen({
  onPasswordClick,
  onEmailSuccess,
  initialError,
}: EmailScreenProps) {
  const [alertMessage, setAlertMessage] = useState<{
    type: alertType;
    message: string;
  } | null>(initialError ? { type: 'error', message: initialError } : null);
  const [showEmailSuccess, setShowEmailSuccess] = useState(false);

  const emailForm = useForm<withEmailType>({
    resolver: zodResolver(withEmailSchema),
    defaultValues: {
      email: '',
    },
  });

  const onEmailSubmit = async (data: withEmailType) => {
    try {
      setAlertMessage(null);

      const result = await signIn('email', {
        email: data.email,
        redirect: false,
      });

      if (result?.ok) {
        setShowEmailSuccess(true);
        onEmailSuccess();
        setAlertMessage({
          type: 'success',
          message:
            "Check your email for a magic link to sign in. The link expires in 10 minutes. Don't forget to check your spam folder.",
        });
      } else if (result?.error) {
        setAlertMessage({
          type: 'error',
          message: result.error,
        });
      }
    } catch {
      setAlertMessage({
        type: 'error',
        message: 'An unexpected error occurred. Please try again.',
      });
    }
  };

  const handleSocialSignIn = async (provider: string) => {
    try {
      setAlertMessage(null);
      await signIn(provider, {
        callbackUrl: '/dashboard',
        redirect: true,
      });
    } catch {
      setAlertMessage({
        type: 'error',
        message: 'Failed to sign in with social provider.',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="mx-auto w-full md:max-w-sm px-12 md:px-0 py-20">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-sans font-bold text-heading tracking-tighter text-foreground mb-0.5">
            Welcome back
          </h1>
          <p className="text-gray-500 text-sm font-light">
            Sign in to your account to continue
          </p>
        </div>

        {alertMessage && (
          <Alert
            className="mb-3 text-sm"
            color={getAlertColor(alertMessage.type)}
            description={alertMessage.message}
            title={
              alertMessage.type === 'error'
                ? 'Error'
                : alertMessage.type === 'success'
                  ? 'Success'
                  : 'Info'
            }
            onClose={() => setAlertMessage(null)}
          />
        )}

        <div className="gap-4 flex flex-col">
          {!showEmailSuccess && (
            <Controller
              control={emailForm.control}
              name="email"
              render={({ field }) => (
                <Input
                  {...field}
                  classNames={{
                    inputWrapper:
                      'border-1 h-14 border-default-300 rounded-2xl',
                    label: 'font-light text-default-400',
                  }}
                  color="primary"
                  errorMessage={emailForm.formState.errors.email?.message}
                  isInvalid={!!emailForm.formState.errors.email}
                  label="Email"
                  placeholder="you@example.com"
                  type="email"
                  variant="bordered"
                />
              )}
            />
          )}

          {!showEmailSuccess && (
            <Button
              className="w-full font-medium rounded-full max-sm:py-6"
              color="primary"
              isLoading={emailForm.formState.isSubmitting}
              size="md"
              onPress={() => emailForm.handleSubmit(onEmailSubmit)()}
            >
              Continue with email
            </Button>
          )}

          {showEmailSuccess && (
            <Button
              className="text-brand hover:text-brand/80"
              startContent={<div>←</div>}
              variant="light"
              onPress={() => {
                setShowEmailSuccess(false);
                setAlertMessage(null);
              }}
            >
              Try a different email
            </Button>
          )}
        </div>

        <div className="flex items-center gap-4 my-6 px-4">
          <Divider className="flex-1" />
          <span className="text-xs text-default-500">OR</span>
          <Divider className="flex-1" />
        </div>

        <div className="text-center">
          <div className="flex flex-col gap-3">
            <Button
              className="border-gray-300 border-1 text-sm rounded-full"
              startContent={<FaLock className="w-5 h-5" />}
              variant="bordered"
              onPress={onPasswordClick}
            >
              Continue with password
            </Button>

            <Button
              className="border-gray-300 border-1 text-sm rounded-full"
              startContent={<FcGoogle className="w-5 h-5" />}
              variant="bordered"
              onPress={() => handleSocialSignIn('google')}
            >
              Continue with Google
            </Button>

            <Button
              className="border-gray-300 border-1 text-sm rounded-full"
              startContent={<FaXTwitter className="w-5 h-5" />}
              variant="bordered"
              onPress={() => handleSocialSignIn('twitter')}
            >
              Continue with Twitter
            </Button>

            <Button
              className="border-gray-300 border-1 text-sm rounded-full"
              startContent={<FaApple className="w-5 h-5" />}
              variant="bordered"
              onPress={() => handleSocialSignIn('apple')}
            >
              Continue with Apple
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
