import { z } from "zod";

export const MIN_PASSWORD_UTF8_BYTES = 10;
export const MAX_PASSWORD_UTF8_BYTES = 1024;
export const MAX_EMAIL_LENGTH = 254;

const utf8Encoder = new TextEncoder();

export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function validatePasswordUtf8Bytes(password: string): {
  valid: boolean;
  byteLength: number;
  error?: string;
} {
  const byteLength = utf8Encoder.encode(password).length;
  if (byteLength < MIN_PASSWORD_UTF8_BYTES) {
    return {
      valid: false,
      byteLength,
      error: `Password must be at least ${MIN_PASSWORD_UTF8_BYTES} bytes (UTF-8).`,
    };
  }
  if (byteLength > MAX_PASSWORD_UTF8_BYTES) {
    return {
      valid: false,
      byteLength,
      error: `Password must not exceed ${MAX_PASSWORD_UTF8_BYTES} bytes (UTF-8).`,
    };
  }
  return {
    valid: true,
    byteLength,
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailFieldSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(MAX_EMAIL_LENGTH, "Email address is too long.")
  .refine((value) => EMAIL_REGEX.test(value), {
    message: "Enter a valid email address.",
  });

export const emailContinueSchema = z.object({
  email: emailFieldSchema,
});

export type EmailContinueFormValues = z.infer<typeof emailContinueSchema>;

export const newPasswordFieldSchema = z
  .string()
  .refine((value) => new TextEncoder().encode(value).length >= MIN_PASSWORD_UTF8_BYTES, {
    message: `Password must be at least ${MIN_PASSWORD_UTF8_BYTES} characters (UTF-8 bytes).`,
  })
  .refine((value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_UTF8_BYTES, {
    message: `Password must be ${MAX_PASSWORD_UTF8_BYTES} UTF-8 bytes or fewer.`,
  });

export const signInPasswordFieldSchema = z
  .string()
  .refine((value) => new TextEncoder().encode(value).length >= 1, {
    message: "Enter your password.",
  })
  .refine((value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_UTF8_BYTES, {
    message: `Password must be ${MAX_PASSWORD_UTF8_BYTES} UTF-8 bytes or fewer.`,
  });

export const passwordSignInSchema = z.object({
  email: emailFieldSchema,
  password: signInPasswordFieldSchema,
});

export type PasswordSignInFormValues = z.infer<typeof passwordSignInSchema>;

export const forgotPasswordSchema = z.object({
  email: emailFieldSchema,
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const createPasswordSchema = z
  .object({
    password: newPasswordFieldSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type CreatePasswordFormValues = z.infer<typeof createPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: newPasswordFieldSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
