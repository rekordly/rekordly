'use client';

import { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { InputOtp } from '@heroui/input-otp';
import { Alert } from '@heroui/alert';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

import { getAlertColor } from '@/lib/fn';

interface OtpScreenProps {
  email: string;
  onBack: () => void;
  initialMessage?: string;
}

type alertType = 'success' | 'error' | 'warning' | 'info';

export function OtpScreen({ email, onBack, initialMessage }: OtpScreenProps) {
  const router = useRouter();
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [isResending, setIsResending] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{
    type: alertType;
    message: string;
  } | null>(initialMessage ? { type: 'info', message: initialMessage } : null);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleOtpChange = (value: string) => {
    setOtpValue(value);
    if (otpError) setOtpError('');
    if (alertMessage) setAlertMessage(null);
  };

  const handleVerifyOtp = async () => {
    if (otpValue.length !== 6) {
      setOtpError('Please enter a 6-digit code');
      return;
    }

    setIsVerifying(true);
    setAlertMessage(null);

    try {
      const result = await signIn('otp', {
        email: email,
        otp: otpValue,
        redirect: false,
      });

      if (result?.ok) {
        setAlertMessage({
          type: 'success',
          message: 'Code verified successfully! Redirecting...',
        });

        setTimeout(() => {
          router.push('/dashboard');
          router.refresh();
        }, 1000);
      } else {
        setOtpError(result?.error || 'Invalid code. Please try again.');
        setAlertMessage({
          type: 'error',
          message: result?.error || 'Invalid code. Please try again.',
        });
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Invalid code. Please try again.';
      setOtpError(errorMessage);
      setAlertMessage({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    setIsResending(true);
    setOtpValue('');
    setOtpError('');
    setAlertMessage(null);

    try {
      await axios.post('/api/resend-code', {
        email: email,
      });

      setCountdown(30);
      setAlertMessage({
        type: 'success',
        message: 'Verification code sent successfully!',
      });
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || 'Failed to resend code';
      setAlertMessage({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="mx-auto w-full md:max-w-sm px-12 md:px-0 py-20">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-sans font-bold text-heading tracking-tighter text-foreground mb-0.5">
            Verify your email
          </h1>
          <p className="text-gray-500 text-sm font-light">
            {`We've sent a 6-digit code to`}
            <br />
            <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        {alertMessage && (
          <Alert
            className="mb-4"
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

        <div className="flex flex-col gap-6">
          <div className="w-full">
            <InputOtp
              classNames={{
                segmentWrapper: 'gap-2 w-full mx-auto justify-center',
                segment: 'h-14',
              }}
              color="primary"
              fullWidth={true}
              isInvalid={!!otpError}
              length={6}
              size="lg"
              value={otpValue}
              variant="bordered"
              onValueChange={handleOtpChange}
            />
            {otpError && (
              <p className="text-danger text-xs px-1 mt-1">{otpError}</p>
            )}
          </div>

          <Button
            className="w-full font-medium rounded-full"
            color="primary"
            isDisabled={otpValue.length !== 6}
            isLoading={isVerifying}
            size="lg"
            onPress={handleVerifyOtp}
          >
            Verify Code
          </Button>

          <div className="text-center">
            <p className="text-sm text-default-600">
              {`Didn't receive the code? `}
              {countdown > 0 ? (
                <span className="text-default-400">Resend in {countdown}s</span>
              ) : (
                <Button
                  className="text-brand hover:text-brand/80 font-medium p-0 h-auto min-w-0"
                  isLoading={isResending}
                  size="sm"
                  variant="light"
                  onPress={handleResendOtp}
                >
                  Resend
                </Button>
              )}
            </p>
          </div>

          <Button
            className="text-default-600"
            startContent={<div>←</div>}
            variant="light"
            onPress={onBack}
          >
            Back to account
          </Button>
        </div>
      </div>
    </div>
  );
}
