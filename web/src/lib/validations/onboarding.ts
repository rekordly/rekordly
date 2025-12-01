import { z } from 'zod';

// Personal Information Schema (for users WITH password - password is optional)
export const personalInfoSchema = z.object({
  fullName: z
    .string()
    .min(2, { message: 'Full name is required (min 2 characters)' }),
  phoneNumber: z.string().regex(/^0(70|71|80|81|90|91)[0-9]{8}$/, {
    message:
      'Please enter a valid Nigerian phone number (11 digits starting with 070, 071, 080, 081, 090, or 091)',
  }),
  email: z.string().email({ message: 'Valid email is required' }),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
  heardFrom: z
    .string()
    .min(1, { message: 'Please select how you heard about us' }),
  referralCode: z.string().optional(),
});

// Personal Info Schema for users WITHOUT password (requires password)
export const personalInfoSchemaWithPassword = z
  .object({
    fullName: z
      .string()
      .min(2, { message: 'Full name is required (min 2 characters)' }),
    phoneNumber: z.string().regex(/^0(70|71|80|81|90|91)[0-9]{8}$/, {
      message:
        'Please enter a valid Nigerian phone number (11 digits starting with 070, 071, 080, 081, 090, or 091)',
    }),
    email: z.string().email({ message: 'Valid email is required' }),
    password: z
      .string()
      .min(6, { message: 'Password must be at least 6 characters' }),
    confirmPassword: z
      .string()
      .min(1, { message: 'Please confirm your password' }),
    heardFrom: z
      .string()
      .min(1, { message: 'Please select how you heard about us' }),
    referralCode: z.string().optional(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'], // This shows the error on the confirmPassword field
  });

// Work Type Schema
export const workTypeSchema = z.object({
  workTypes: z
    .array(
      z.enum(['self-employed', 'freelancer', 'employed', 'business-owner'])
    )
    .min(1, { message: 'Please select at least one work type' }),
});

// Valid registration types
const validRegistrationTypes = [
  'Not yet registered',
  'Business Name',
  'Limited Liability Company (Ltd)',
  'Public Limited Company (PLC)',
  'Limited by Guarantee',
  'Unlimited Company',
  'Limited Liability Partnership (LLP)',
] as const;

// Final Details Schema
export const finalSchema = z.object({
  registrationType: z
    .string()
    .min(1, { message: 'Please select your registration type' })
    .refine(val => validRegistrationTypes.includes(val as any), {
      message: 'Please select a valid registration type',
    }),
  businessName: z.string().optional(),
  startDate: z.string().min(1, { message: 'Please select a start date' }),
  confirmNotifications: z.boolean().optional(),
  confirmTerms: z.boolean().refine(val => val === true, {
    message: 'Please accept the terms and conditions',
  }),
});
