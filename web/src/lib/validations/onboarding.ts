import { z } from 'zod';


// Personal Information Schema (with conditional password validation)
export const personalInfoSchema = z.object({
  fullName: z.string().min(2, { message: 'Full name is required (min 2 characters)' }),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, { message: 'Valid phone number is required' }),
  email: z.string().email({ message: 'Valid email is required' }),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
  heardFrom: z.string().min(1, { message: 'Please select how you heard about us' }),
  referralCode: z.string().optional()
}).refine((data) => {
  // If password is provided, it must be at least 6 characters
  if (data.password && data.password.length < 6) {
    return false;
  }
  return true;
}, {
  message: "Password must be at least 6 characters",
  path: ["password"],
}).refine((data) => {
  if (data.password) {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Personal Info Schema for users WITHOUT password (requires password)
export const personalInfoSchemaWithPassword = z.object({
  fullName: z.string().min(2, { message: 'Full name is required (min 2 characters)' }),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, { message: 'Valid phone number is required' }),
  email: z.string().email({ message: 'Valid email is required' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  confirmPassword: z.string().min(1, { message: 'Please confirm your password' }),
  heardFrom: z.string().min(1, { message: 'Please select how you heard about us' }),
  referralCode: z.string().optional()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Work Type Schema
export const workTypeSchema = z.object({
  workType: z.enum(['self-employed', 'freelancer', 'remote-worker', 'business-owner', 'digital-trader'], {
    message: 'Please select your work type'
  }),
});

// Self-Employed Schema
export const selfEmployedSchema = z.object({
  businessType: z.string().min(1, { message: 'Please select a business type' }),
  businessTypeOther: z.string().optional(),
  registrationType: z.string().min(1, { message: 'Please select a registration type' }),
  businessName: z.string().optional(),
  description: z.string().min(10, { message: 'Please provide a description (min 10 characters)' }),
  startDate: z.string().min(1, { message: 'Please select a start date' }),
  earningMethods: z.array(z.string()).min(1, { message: 'Please select at least one earning method' }),
});

// Freelancer Schema
export const freelancerSchema = z.object({
  freelanceType: z.string().min(1, { message: 'Please select a freelance type' }),
  registrationType: z.string().optional(),
  description: z.string().min(10, { message: 'Please provide a description (min 10 characters)' }),
  startDate: z.string().min(1, { message: 'Please select a start date' }),
  earningMethods: z.array(z.string()).min(1, { message: 'Please select at least one earning method' }),
});

// Remote Worker Schema
export const remoteWorkerSchema = z.object({
  industry: z.string().min(1, { message: 'Please select an industry' }),
  employmentType: z.enum(['full-time', 'part-time', 'contract'], {
    message: 'Please select an employment type'
  }),
  startDate: z.string().min(1, { message: 'Please select a start date' }),
  paymentMethods: z.array(z.string()).min(1, { message: 'Please select at least one payment method' }),
});

// Business Owner Schema
export const businessOwnerSchema = z.object({
  industry: z.string().min(1, { message: 'Please select an industry' }),
  registrationType: z.string().min(1, { message: 'Please select a registration type' }),
  companyName: z.string().min(1, { message: 'Company name is required' }),
  description: z.string().min(10, { message: 'Please provide a description (min 10 characters)' }),
  startDate: z.string().min(1, { message: 'Please select a start date' }),
  employeeCount: z.string().min(1, { message: 'Please select employee count' }),
  earningMethods: z.array(z.string()).min(1, { message: 'Please select at least one earning method' }),
});

// Digital Trader Schema
export const digitalTraderSchema = z.object({
  assetType: z.string().min(1, { message: 'Please select an asset type' }),
  registrationType: z.string().optional(),
  platforms: z.string().min(1, { message: 'Please enter trading platforms' }),
  startDate: z.string().min(1, { message: 'Please select a start date' }),
  earningMethods: z.array(z.string()).min(1, { message: 'Please select at least one earning method' }),
});

// Confirmation Schema
export const confirmationSchema = z.object({
  confirmAccuracy: z.boolean().refine(val => val === true, { 
    message: 'Please confirm the accuracy of your information' 
  }),
  confirmTerms: z.boolean().refine(val => val === true, { 
    message: 'Please accept the terms and conditions' 
  }),
});

// Get the appropriate schema based on work type
export const getWorkTypeSchema = (workType: string) => {
  switch(workType) {
    case 'self-employed':
      return selfEmployedSchema;
    case 'freelancer':
      return freelancerSchema;
    case 'remote-worker':
      return remoteWorkerSchema;
    case 'business-owner':
      return businessOwnerSchema;
    case 'digital-trader':
      return digitalTraderSchema;
    default:
      return z.object({});
  }
};