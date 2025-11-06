import * as z from 'zod';

import {
  withPasswordSchema,
  withEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@/lib/validations/auth.schema';

export type withPasswordType = z.infer<typeof withPasswordSchema>;
export type withEmailType = z.infer<typeof withEmailSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

// API response types
