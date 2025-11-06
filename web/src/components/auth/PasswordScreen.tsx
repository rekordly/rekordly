// components/auth/PasswordScreen.tsx
'use client';

import { useState } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Link } from '@heroui/link';
import { Alert } from '@heroui/alert';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import type { withPasswordType } from '@/types/auth.types';
import { withPasswordSchema } from '@/lib/validations/auth.schema';
import { getAlertColor } from '@/lib/fn';

interface PasswordScreenProps {
  initialEmail: string;
  onBack: () => void;
  onOtpRequired: (email: string) => void;
}

type alertType = 'success' | 'error' | 'warning' | 'info';

export function PasswordScreen({
  initialEmail,
  onBack,
  onOtpRequired,
}: PasswordScreenProps) {
  const router = useRouter();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{
    type: alertType;
    message: string;
  } | null>(null);

  const passwordForm = useForm<withPasswordType>({
    resolver: zodResolver(withPasswordSchema),
    defaultValues: {
      email: initialEmail,
      password: '',
    },
  });

  const onPasswordSubmit = async (data: withPasswordType) => {
    try {
      setAlertMessage(null);

      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.ok) {
        router.push('/dashboard');
        router.refresh();
      } else if (result?.error) {
        if (
          result.error.includes('Check your email for the login code') ||
          result.error.includes('No password set') ||
          result.error.includes('Email not verified') ||
          result.error.includes('Account Created Successfully')
        ) {
          onOtpRequired(data.email);
        } else if (result.error.includes('No user found')) {
          setAlertMessage({
            type: 'error',
            message: 'No account found with this email address.',
          });
        } else if (result.error.includes('Invalid credentials')) {
          setAlertMessage({
            type: 'error',
            message: 'Invalid email or password. Please try again.',
          });
        } else {
          setAlertMessage({
            type: 'error',
            message: result.error,
          });
        }
      }
    } catch {
      setAlertMessage({
        type: 'error',
        message: 'An unexpected error occurred. Please try again.',
      });
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    passwordForm.setValue('email', e.target.value);
    if (passwordForm.formState.errors.email) {
      passwordForm.clearErrors('email');
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    passwordForm.setValue('password', e.target.value);
    if (passwordForm.formState.errors.password) {
      passwordForm.clearErrors('password');
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
            Sign in with your password
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

        <div className="gap-5 flex flex-col">
          <Controller
            control={passwordForm.control}
            name="email"
            render={({ field }) => (
              <Input
                {...field}
                classNames={{
                  inputWrapper: 'border-1 h-14 border-default-300 rounded-2xl',
                  label: 'font-light text-default-400',
                }}
                color="primary"
                errorMessage={passwordForm.formState.errors.email?.message}
                isInvalid={!!passwordForm.formState.errors.email}
                label="Email"
                placeholder="you@example.com"
                type="email"
                variant="bordered"
                onChange={e => {
                  field.onChange(e);
                  handleEmailChange(e);
                }}
              />
            )}
          />

          <Controller
            control={passwordForm.control}
            name="password"
            render={({ field }) => (
              <Input
                {...field}
                classNames={{
                  inputWrapper: 'border-1 h-14 border-default-300 rounded-2xl',
                  label: 'font-light text-default-400',
                }}
                color="primary"
                endContent={
                  <button
                    aria-label={
                      isPasswordVisible ? 'Hide password' : 'Show password'
                    }
                    className="text-sm text-primary focus:outline-none"
                    type="button"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  >
                    {isPasswordVisible ? 'Hide' : 'Show'}
                  </button>
                }
                errorMessage={passwordForm.formState.errors.password?.message}
                isInvalid={!!passwordForm.formState.errors.password}
                label="Password"
                placeholder="Enter your password"
                type={isPasswordVisible ? 'text' : 'password'}
                variant="bordered"
                onChange={e => {
                  field.onChange(e);
                  handlePasswordChange(e);
                }}
              />
            )}
          />

          <Button
            className="w-full font-medium rounded-full max-sm:py-6"
            color="primary"
            isLoading={passwordForm.formState.isSubmitting}
            size="md"
            onPress={() => passwordForm.handleSubmit(onPasswordSubmit)()}
          >
            Continue
          </Button>
        </div>

        <div className="flex items-center justify-between py-2">
          <Button
            className="text-default-600 p-0 h-auto min-w-0"
            startContent={<div>←</div>}
            variant="light"
            onPress={onBack}
          >
            Back
          </Button>
          <Link className="text-default-500" href="/forgot-password" size="sm">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
