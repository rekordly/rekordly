// @/lib/validations/profile.ts

import { z } from 'zod';
import { validRegistrationTypes } from './general';

export const UpdateBasicDetailsSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  phoneNumber: z
    .string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(15),
});

export const UpdateWorkDetailsSchema = z.object({
  registrationType: z
    .string()
    .min(1, 'Please select your registration type')
    .refine(val => validRegistrationTypes.includes(val as any), {
      message: 'Please select a valid registration type',
    }),
  businessName: z.string().optional().nullable(),
  workTypes: z.array(z.string()).min(1, 'Please select at least one work type'),
  startDate: z.string().min(1, 'Please select a start date'),
});

export const UpdateAgencyDetailsSchema = z.object({
  heardFrom: z.string().min(1, 'Please select how you heard about us'),
  referralCode: z.string().optional().nullable(),
});

export const AddBankAccountSchema = z.object({
  bankName: z.string().min(2, 'Bank name is required'),
  accountNumber: z
    .string()
    .min(10, 'Account number must be at least 10 digits')
    .max(10, 'Account number must be 10 digits'),
  accountName: z.string().min(2, 'Account name is required'),
  isDefault: z.boolean().default(false),
});

export const UpdateProfileImageSchema = z.object({
  imageUrl: z.string().url('Invalid image URL'),
});
