'use client';

import { useState } from 'react';
import { use } from 'react';

import { EmailScreen } from '@/components/auth/EmailScreen';
import { PasswordScreen } from '@/components/auth/PasswordScreen';
import { OtpScreen } from '@/components/auth/OtpScreen';

type ScreenState = 'email' | 'password' | 'otp';

interface LoginPageProps {
  searchParams?: Promise<{ error?: string }>;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const [screenState, setScreenState] = useState<ScreenState>('email');
  const [userEmail, setUserEmail] = useState('');

  // FIX: Provide a typed fallback for the use() hook
  const resolvedSearchParams = use(
    searchParams || Promise.resolve({ error: undefined })
  );
  const initialError = resolvedSearchParams.error;

  const handlePasswordClick = () => {
    setScreenState('password');
  };

  const handleOtpRequired = (email: string) => {
    setUserEmail(email);
    setScreenState('otp');
  };

  const handleBackToEmail = () => {
    setScreenState('email');
    setUserEmail('');
  };

  const handleEmailSuccess = () => {
    // Email magic link sent successfully
  };

  if (screenState === 'otp') {
    return (
      <OtpScreen
        email={userEmail}
        initialMessage="A verification code has been sent to your email."
        onBack={handleBackToEmail}
      />
    );
  }

  if (screenState === 'password') {
    return (
      <PasswordScreen
        initialEmail={userEmail}
        onBack={handleBackToEmail}
        onOtpRequired={handleOtpRequired}
      />
    );
  }

  return (
    <EmailScreen
      initialError={initialError}
      onEmailSuccess={handleEmailSuccess}
      onPasswordClick={handlePasswordClick}
    />
  );
}
