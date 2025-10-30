// app/(auth)/register/page.tsx
"use client";

import {useState, useEffect} from 'react';
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Divider } from "@heroui/divider";
import { Link } from "@heroui/link";
import { Alert } from "@heroui/alert";
import { FcGoogle } from "react-icons/fc";
import { FaXTwitter, FaApple } from "react-icons/fa6";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {withEmailType} from '@/types/auth.types';
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAlertColor } from '@/lib/fn';
import {withEmailSchema} from '@/lib/validations/auth.schema';

// Map NextAuth error codes to user-friendly messages
const getErrorMessage = (error: string | null): string | null => {
  if (!error) return null;
  
  const errorMessages: Record<string, string> = {
    'OAuthSignin': 'Error connecting to the authentication provider.',
    'OAuthCallback': 'Error in authentication callback.',
    'OAuthCreateAccount': 'Could not create your account.',
    'EmailCreateAccount': 'Could not create your account.',
    'Callback': 'Error in authentication process.',
    'OAuthAccountNotLinked': 'This email is already registered with a different provider. Please sign in using your original method.',
    'EmailSignin': 'Failed to send verification email.',
    'CredentialsSignin': 'Invalid email or password.',
    'SessionRequired': 'Please sign in to access this page.',
    'Default': 'An error occurred during authentication.'
  };

  return errorMessages[error] || errorMessages['Default'];
};

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showEmailSuccess, setShowEmailSuccess] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [alertMessage, setAlertMessage] = useState<{
    type: "success" | "error" | "warning" | "info";
    message: string;
  } | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<withEmailType>({
    resolver: zodResolver(withEmailSchema),
    defaultValues: {
      email: '',
    }
  });

  // Check for error in URL parameters on mount
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      const errorMessage = getErrorMessage(error);
      if (errorMessage) {
        setAlertMessage({
          type: "error",
          message: errorMessage,
        });
      }
      
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  const onSubmit = async (data: withEmailType) => {
    try {
      setUserEmail(data.email);
      setAlertMessage(null);

      // Use NextAuth's email provider (magic link)
      const result = await signIn("email", {
        email: data.email,
        redirect: false,
      });

      if (result?.ok) {
        setShowEmailSuccess(true);
        setAlertMessage({
          type: "success",
          message: "Check your email to confirm your account. The confirmation link expires in 10 minutes. Don't forget to check your spam folder.",
        });
      } else if (result?.error) {
        setAlertMessage({
          type: "error",
          message: result.error,
        });
      }
    } catch (error) {
      setAlertMessage({
        type: "error",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  };

  const handleSocialSignIn = async (provider: string) => {
    try {
      setAlertMessage(null);
      await signIn(provider, { 
        callbackUrl: "/onboarding",
        redirect: true
      });
    } catch (error) {
      setAlertMessage({
        type: "error",
        message: "Failed to sign in with social provider.",
      });
    }
  };

  return (
    <div className='min-h-screen flex items-center justify-center'>
      <div className="mx-auto w-full md:max-w-sm px-12 md:px-0 py-20">
        <div className='mb-4 text-center'>
          <h1 className="text-3xl font-sans font-bold text-heading tracking-tighter text-foreground mb-0.5">
            Create account
          </h1>
          <p className="text-gray-500 text-sm font-light">Sign up to get started</p>
        </div>

        {/* Alert Messages */}
        {alertMessage && (
          <Alert
            color={getAlertColor(alertMessage.type)}
            className="mb-4"
            title={alertMessage.type === "error" ? "Error" : alertMessage.type === "success" ? "Success" : "Info"}
            description={alertMessage.message}
            onClose={() => setAlertMessage(null)}
          />
        )}

        <div className="gap-5 flex flex-col mt-8">
          {/* Email Input */}
          {!showEmailSuccess && (
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  type="email"
                  label="Email"
                  placeholder="you@example.com"
                  color='primary'
                  variant='bordered'
                  isInvalid={!!errors.email}
                  errorMessage={errors.email?.message}
                  classNames={{
                    inputWrapper: "border-1 h-14 border-default-300 rounded-2xl",
                    label: "font-light text-default-400"
                  }}
                />
              )}
            />
          )}

          {!showEmailSuccess && (
            <Button
              onPress={() => handleSubmit(onSubmit)()}
              color="primary"
              className="w-full font-medium rounded-full max-sm:py-6"
              size="md"
              isLoading={isSubmitting}
            >
              Continue with email
            </Button>
          )}

          {showEmailSuccess && (
            <Button
              variant="light"
              onPress={() => {
                setShowEmailSuccess(false);
                setAlertMessage(null);
              }}
              className="text-brand hover:text-brand/80"
              startContent={<div>←</div>}
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
              variant="bordered"
              className="border-gray-300 border-1 text-sm rounded-full"
              startContent={<FcGoogle className="w-5 h-5" />}
              onPress={() => handleSocialSignIn("google")}
            >
              Continue with Google
            </Button>

            <Button
              variant="bordered"
              className="border-gray-300 border-1 text-sm rounded-full"
              startContent={<FaXTwitter className="w-5 h-5" />}
              onPress={() => handleSocialSignIn("twitter")}
            >
              Continue with Twitter
            </Button>

            <Button
              variant="bordered"
              className="border-gray-300 border-1 text-sm rounded-full"
              startContent={<FaApple className="w-5 h-5" />}
              onPress={() => handleSocialSignIn("apple")}
            >
              Continue with Apple
            </Button>
          </div>
        </div>

       
      </div>
    </div>
  );
}