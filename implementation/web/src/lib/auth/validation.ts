import { z } from "zod";

export const MIN_PASSWORD_UTF8_BYTES = 10;
export const MAX_PASSWORD_UTF8_BYTES = 1024;
export const MAX_EMAIL_LENGTH = 254;
export const OTP_CODE_LENGTH = 6;

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

export function normalizeOtpInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, OTP_CODE_LENGTH);
}

export function splitOtpIntoSlots(code: string): string[] {
  const clean = normalizeOtpInput(code);
  return Array.from({ length: OTP_CODE_LENGTH }, (_, idx) => clean[idx] ?? "");
}

export function applyOtpSlotInput(
  currentSlots: readonly string[],
  slotIndex: number,
  rawInput: string,
): {
  slots: string[];
  code: string;
  nextFocusIndex: number;
} {
  const nextSlots = Array.from(
    { length: OTP_CODE_LENGTH },
    (_, idx) => normalizeOtpInput(currentSlots[idx] ?? "").slice(0, 1),
  );
  const digits = rawInput.replace(/[^0-9]/g, "");

  if (digits.length === 0) {
    if (slotIndex >= 0 && slotIndex < OTP_CODE_LENGTH) {
      nextSlots[slotIndex] = "";
    }
    return {
      slots: nextSlots,
      code: nextSlots.join(""),
      nextFocusIndex: Math.max(0, Math.min(OTP_CODE_LENGTH - 1, slotIndex)),
    };
  }

  if (digits.length > 1) {
    // Multi-digit paste or autofill starting at slotIndex (or 0 if full 6 digits)
    const startIndex = digits.length >= OTP_CODE_LENGTH ? 0 : Math.max(0, slotIndex);
    let lastFilled = startIndex;
    for (let offset = 0; offset < digits.length; offset += 1) {
      const targetIndex = startIndex + offset;
      if (targetIndex >= OTP_CODE_LENGTH) {
        break;
      }
      nextSlots[targetIndex] = digits[offset] ?? "";
      lastFilled = targetIndex;
    }
    return {
      slots: nextSlots,
      code: nextSlots.join(""),
      nextFocusIndex: Math.min(OTP_CODE_LENGTH - 1, lastFilled + 1),
    };
  }

  const singleDigit = digits[0] ?? "";
  const safeIndex = Math.max(0, Math.min(OTP_CODE_LENGTH - 1, slotIndex));
  nextSlots[safeIndex] = singleDigit;
  return {
    slots: nextSlots,
    code: nextSlots.join(""),
    nextFocusIndex: Math.min(OTP_CODE_LENGTH - 1, safeIndex + 1),
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^[0-9]{6}$/;

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

export const otpPurposeFieldSchema = z.enum(["registration", "sign_in"]);

export const otpCodeFieldSchema = z
  .string()
  .trim()
  .refine((value) => OTP_REGEX.test(value), {
    message: "Enter the 6-digit verification code.",
  });

export const otpVerifySchema = z.object({
  email: emailFieldSchema,
  purpose: otpPurposeFieldSchema,
  code: otpCodeFieldSchema,
});

export type OtpVerifyFormValues = z.infer<typeof otpVerifySchema>;

export const magicLinkRequestSchema = z.object({
  email: emailFieldSchema,
});

export type MagicLinkRequestFormValues = z.infer<typeof magicLinkRequestSchema>;

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

export const googleLinkPasswordSchema = z.object({
  password: signInPasswordFieldSchema,
});

export type GoogleLinkPasswordFormValues = z.infer<typeof googleLinkPasswordSchema>;

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
