"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Divider } from "@heroui/divider";
import { Link } from "@heroui/link";
import { InputOtp } from "@heroui/input-otp";
import { Alert } from "@heroui/alert";
import { FcGoogle } from "react-icons/fc";
import { FaXTwitter, FaApple, FaLock } from "react-icons/fa6";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {withPasswordSchema, withEmailSchema} from '@/lib/validations/auth.schema';
import type { withPasswordType, withEmailType } from "@/types/auth.types";
import { getAlertColor } from '@/lib/fn';
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";

type ScreenState = "email" | "password" | "otp";
type alertType = "success" | "error" | "warning" | "info";

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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [screenState, setScreenState] = useState<ScreenState>("email");
  const [userEmail, setUserEmail] = useState<string>("");
  const [otpValue, setOtpValue] = useState<string>("");
  const [otpError, setOtpError] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [showEmailSuccess, setShowEmailSuccess] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<{
    type: alertType;
    message: string;
  } | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);

  // Form for email magic link
  const emailForm = useForm<withEmailType>({
    resolver: zodResolver(withEmailSchema),
    defaultValues: {
      email: '',
    }
  });

  // Watch email field in email form
  const emailFieldValue = useWatch({
    control: emailForm.control,
    name: "email"
  });

  // Form for password login
  const passwordForm = useForm<withPasswordType>({
    resolver: zodResolver(withPasswordSchema),
    defaultValues: {
      email: '',
      password: '',
    }
  });

  // Sync email between forms
  useEffect(() => {
    if (emailFieldValue) {
      passwordForm.setValue("email", emailFieldValue);
    }
  }, [emailFieldValue, passwordForm]);

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

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Handle email magic link submission
  const onEmailSubmit = async (data: withEmailType) => {
    try {
      setUserEmail(data.email);
      setAlertMessage(null);

      const result = await signIn("email", {
        email: data.email,
        redirect: false,
      });

      if (result?.ok) {
        setShowEmailSuccess(true);
        setAlertMessage({
          type: "success",
          message: "Check your email for a magic link to sign in. The link expires in 10 minutes. Don't forget to check your spam folder.",
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

  // Handle password login submission
  const onPasswordSubmit = async (data: withPasswordType) => {
    try {
      setAlertMessage(null);
      setUserEmail(data.email);

      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.ok) {
        
        router.refresh();
      } else if (result?.error) {
        if (
          result.error.includes("Check your email for the login code") ||
          result.error.includes("No password set") ||
          result.error.includes("Email not verified") ||
          result.error.includes("Account Created Successfully")
        ) {
          setScreenState("otp");
          setCountdown(30);
          setAlertMessage({
            type: "info",
            message: "A verification code has been sent to your email.",
          });
        } else if (result.error.includes("No user found")) {
          setAlertMessage({
            type: "error",
            message: "No account found with this email address.",
          });
        } else if (result.error.includes("Invalid credentials")) {
          setAlertMessage({
            type: "error",
            message: "Invalid email or password. Please try again.",
          });
        } else {
          setAlertMessage({
            type: "error",
            message: result.error,
          });
        }
      }
    } catch (error) {
      setAlertMessage({
        type: "error",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  };

  const handleOtpChange = (value: string) => {
    setOtpValue(value);
    if (otpError) setOtpError("");
    if (alertMessage) setAlertMessage(null);
  };

  const handleVerifyOtp = async () => {
    if (otpValue.length !== 6) {
      setOtpError("Please enter a 6-digit code");
      return;
    }
  
    setIsVerifying(true);
    setAlertMessage(null);
  
    try {
      const result = await signIn("otp", {
        email: userEmail,
        otp: otpValue,
        redirect: false,
      });
    
      if (result?.ok) {
        setAlertMessage({
          type: "success",
          message: "Code verified successfully! Redirecting...",
        });
      
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 1000);
      } else {
        setOtpError(result?.error || "Invalid code. Please try again.");
        setAlertMessage({
          type: "error",
          message: result?.error || "Invalid code. Please try again.",
        });
      }
    } catch (error: any) {
      const errorMessage = error.message || "Invalid code. Please try again.";
      setOtpError(errorMessage);
      setAlertMessage({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    setIsResending(true);
    setOtpValue("");
    setOtpError("");
    setAlertMessage(null);
    
    try {
      await axios.post("/api/resend-code", {
        email: userEmail,
      });

      setCountdown(30);
      setAlertMessage({
        type: "success",
        message: "Verification code sent successfully!",
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || "Failed to resend code";
      setAlertMessage({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleSocialSignIn = async (provider: string) => {
    try {
      setAlertMessage(null);
      await signIn(provider, { 
        callbackUrl: "/dashboard",
        redirect: true
      });
    } catch (error) {
      setAlertMessage({
        type: "error",
        message: "Failed to sign in with social provider.",
      });
    }
  };

  // Handle switching to password screen
  const handleContinueWithPassword = () => {
    const email = emailForm.getValues("email");
    passwordForm.setValue("email", email);
    setUserEmail(email);
    setScreenState("password");
  };

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  // Handle email input change to clear errors
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    passwordForm.setValue("email", e.target.value);
    if (passwordForm.formState.errors.email) {
      passwordForm.clearErrors("email");
    }
  };

  // Handle password input change to clear errors
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    passwordForm.setValue("password", e.target.value);
    if (passwordForm.formState.errors.password) {
      passwordForm.clearErrors("password");
    }
  };

  // OTP Verification Screen
  if (screenState === "otp") {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className="mx-auto w-full md:max-w-sm px-12 md:px-0 py-20">
          <div className='mb-8 text-center'>
            <h1 className="text-3xl font-sans font-bold text-heading tracking-tighter text-foreground mb-0.5">
              Verify your email
            </h1>
            <p className="text-gray-500 text-sm font-light">
              We've sent a 6-digit code to<br />
              <span className="font-medium text-foreground">{userEmail}</span>
            </p>
          </div>

          {alertMessage && (
            <Alert
              color={getAlertColor(alertMessage.type)}
              className="mb-4"
              title={alertMessage.type === "error" ? "Error" : alertMessage.type === "success" ? "Success" : "Info"}
              description={alertMessage.message}
              onClose={() => setAlertMessage(null)}
            />
          )}

          <div className="flex flex-col gap-6">
            <div className="w-full">
              <InputOtp
                length={6}
                value={otpValue}
                onValueChange={handleOtpChange}
                fullWidth={true}
                size='lg'
                isInvalid={!!otpError}
                color="primary"
                variant="bordered"
                classNames={{
                  segmentWrapper: "gap-2 w-full mx-auto justify-center",
                  segment: "h-14"
                }}
              />
              {otpError && (
                <p className="text-danger text-xs px-1 mt-1">{otpError}</p>
              )}
            </div>

            <Button
              onPress={handleVerifyOtp}
              color="primary"
              className="w-full font-medium rounded-full"
              size="lg"
              isLoading={isVerifying}
              isDisabled={otpValue.length !== 6}
            >
              Verify Code
            </Button>

            <div className="text-center">
              <p className="text-sm text-default-600">
                Didn't receive the code?{' '}
                {countdown > 0 ? (
                  <span className="text-default-400">
                    Resend in {countdown}s
                  </span>
                ) : (
                  <Button
                    variant="light"
                    size="sm"
                    onPress={handleResendOtp}
                    isLoading={isResending}
                    className="text-brand hover:text-brand/80 font-medium p-0 h-auto min-w-0"
                  >
                    Resend
                  </Button>
                )}
              </p>
            </div>

            <Button
              variant="light"
              onPress={() => {
                setScreenState("email");
                setAlertMessage(null);
                setShowEmailSuccess(false);
              }}
              className="text-default-600"
              startContent={<div>←</div>}
            >
              Back to account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Password Login Screen
  if (screenState === "password") {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className="mx-auto w-full md:max-w-sm px-12 md:px-0 py-20">
          <div className='text-center mb-8'>
            <h1 className="text-3xl font-sans font-bold text-heading tracking-tighter text-foreground mb-0.5">
              Welcome back
            </h1>
            <p className="text-gray-500 text-sm font-light">Sign in with your password</p>
          </div>

          {alertMessage && (
            <Alert
              color={getAlertColor(alertMessage.type)}
              className="mb-3 text-sm"
              title={alertMessage.type === "error" ? "Error" : alertMessage.type === "success" ? "Success" : "Info"}
              description={alertMessage.message}
              onClose={() => setAlertMessage(null)}
            />
          )}

          <div className="gap-5 flex flex-col">
            <Controller
              name="email"
              control={passwordForm.control}
              render={({ field }) => (
                <Input
                  {...field}
                  type="email"
                  label="Email"
                  placeholder="you@example.com"
                  color='primary'
                  variant='bordered'
                  isInvalid={!!passwordForm.formState.errors.email}
                  errorMessage={passwordForm.formState.errors.email?.message}
                  classNames={{
                    inputWrapper: "border-1 h-14 border-default-300 rounded-2xl",
                    label: "font-light text-default-400"
                  }}
                  onChange={(e) => {
                    field.onChange(e);
                    handleEmailChange(e);
                  }}
                />
              )}
            />

            <Controller
              name="password"
              control={passwordForm.control}
              render={({ field }) => (
                <Input
                  {...field}
                  type={isPasswordVisible ? "text" : "password"}
                  label="Password"
                  color='primary'
                  placeholder="Enter your password"
                  variant="bordered"
                  isInvalid={!!passwordForm.formState.errors.password}
                  errorMessage={passwordForm.formState.errors.password?.message}
                  classNames={{
                    inputWrapper: "border-1 h-14 border-default-300 rounded-2xl",
                    label: "font-light text-default-400"
                  }}
                  onChange={(e) => {
                    field.onChange(e);
                    handlePasswordChange(e);
                  }}
                  endContent={
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      className="text-sm text-primary focus:outline-none"
                      aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                    >
                      {isPasswordVisible ? "Hide" : "Show"}
                    </button>
                  }
                />
              )}
            />

            <Button
              onPress={() => passwordForm.handleSubmit(onPasswordSubmit)()}
              color="primary"
              className="w-full font-medium rounded-full max-sm:py-6"
              size="md"
              isLoading={passwordForm.formState.isSubmitting}
            >
              Continue
            </Button>
          </div>

          <div className="flex items-center justify-between py-2">
            <Button
              variant="light"
              onPress={() => {
                setScreenState("email");
                setAlertMessage(null);
                setShowEmailSuccess(false);
              }}
              className="text-default-600 p-0 h-auto min-w-0"
              startContent={<div>←</div>}
            >
              Back
            </Button>
            <Link href="/forgot-password" size="sm" className="text-default-500">
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Email Magic Link Screen (Default)
  return (
    <div className='min-h-screen flex items-center justify-center'>
      <div className="mx-auto w-full md:max-w-sm px-12 md:px-0 py-20">
        <div className='text-center mb-8'>
          <h1 className="text-3xl font-sans font-bold text-heading tracking-tighter text-foreground mb-0.5">
            Welcome back
          </h1>
          <p className="text-gray-500 text-sm font-light">Sign in to your account to continue</p>
        </div>

        {alertMessage && (
          <Alert
            color={getAlertColor(alertMessage.type)}
            className="mb-3 text-sm"
            title={alertMessage.type === "error" ? "Error" : alertMessage.type === "success" ? "Success" : "Info"}
            description={alertMessage.message}
            onClose={() => setAlertMessage(null)}
          />
        )}

        <div className="gap-4 flex flex-col">
          {!showEmailSuccess && (
            <Controller
              name="email"
              control={emailForm.control}
              render={({ field }) => (
                <Input
                  {...field}
                  type="email"
                  label="Email"
                  placeholder="you@example.com"
                  color='primary'
                  variant='bordered'
                  isInvalid={!!emailForm.formState.errors.email}
                  errorMessage={emailForm.formState.errors.email?.message}
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
              onPress={() => emailForm.handleSubmit(onEmailSubmit)()}
              color="primary"
              className="w-full font-medium rounded-full max-sm:py-6"
              size="md"
              isLoading={emailForm.formState.isSubmitting}
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
              startContent={<FaLock className="w-5 h-5" />}
              onPress={handleContinueWithPassword}
            >
              Continue with password
            </Button>

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