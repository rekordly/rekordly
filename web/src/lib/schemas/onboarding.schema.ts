import * as z from "zod";


// Enums
export const WorkTypeEnum = {
  SELF_EMPLOYED: "SELF_EMPLOYED",
  FREELANCER: "FREELANCER",
  REMOTE_WORKER: "REMOTE_WORKER",
  SMALL_BUSINESS_OWNER: "SMALL_BUSINESS_OWNER",
  DIGITAL_ASSET_TRADER: "DIGITAL_ASSET_TRADER",
} as const;

export const HowDidYouKnowEnum = {
  SOCIAL_MEDIA: "social_media",
  FRIEND: "friend",
  SEARCH_ENGINE: "search_engine",
  ADVERTISEMENT: "advertisement",
  BLOG: "blog",
  OTHER: "other",
} as const;

// Step 1: Basic Information Schema
export const step1Schema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  howDidYouKnow: z.enum([
    HowDidYouKnowEnum.SOCIAL_MEDIA,
    HowDidYouKnowEnum.FRIEND,
    HowDidYouKnowEnum.SEARCH_ENGINE,
    HowDidYouKnowEnum.ADVERTISEMENT,
    HowDidYouKnowEnum.BLOG,
    HowDidYouKnowEnum.OTHER,
  ]),
  howDidYouKnowOther: z.string().optional(),
  referralCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
}).refine((data) => {
  if (data.howDidYouKnow === HowDidYouKnowEnum.OTHER && !data.howDidYouKnowOther) {
    return false;
  }
  return true;
}, {
  message: "Please specify how you heard about us",
  path: ["howDidYouKnowOther"],
});

// Step 2: Work Type Schema
export const step2Schema = z.object({
  workType: z.enum([
    WorkTypeEnum.SELF_EMPLOYED,
    WorkTypeEnum.FREELANCER,
    WorkTypeEnum.REMOTE_WORKER,
    WorkTypeEnum.SMALL_BUSINESS_OWNER,
    WorkTypeEnum.DIGITAL_ASSET_TRADER,
  ]),
});

// Step 3: Self-Employed Schema
export const selfEmployedSchema = z.object({
  businessCategory: z.string().min(1, "Business category is required"),
  businessCategoryOther: z.string().optional(),
  businessName: z.string().optional(),
  businessDescription: z.string().max(150, "Description must be 150 characters or less"),
  businessStartDate: z.string().min(1, "Start date is required"),
  incomeMethod: z.array(z.string()).min(1, "Select at least one income method"),
  incomeMethodOther: z.string().optional(),
}).refine((data) => {
  if (data.businessCategory === "other" && !data.businessCategoryOther) {
    return false;
  }
  return true;
}, {
  message: "Please specify your business category",
  path: ["businessCategoryOther"],
});

// Step 3: Freelancer Schema
export const freelancerSchema = z.object({
  freelanceCategory: z.string().min(1, "Freelance category is required"),
  freelanceCategoryOther: z.string().optional(),
  servicesDescription: z.string().max(150, "Description must be 150 characters or less"),
  freelanceStartDate: z.string().min(1, "Start date is required"),
  incomeMethod: z.array(z.string()).min(1, "Select at least one payment method"),
  incomeMethodOther: z.string().optional(),
}).refine((data) => {
  if (data.freelanceCategory === "other" && !data.freelanceCategoryOther) {
    return false;
  }
  return true;
}, {
  message: "Please specify your freelance category",
  path: ["freelanceCategoryOther"],
});

// Step 3: Remote Worker Schema
export const remoteWorkerSchema = z.object({
  industry: z.string().min(1, "Industry is required"),
  industryOther: z.string().optional(),
  employmentType: z.enum(["full_time", "part_time", "contract"]),
  jobStartDate: z.string().min(1, "Start date is required"),
  paymentMethod: z.array(z.string()).min(1, "Select at least one payment method"),
  paymentMethodOther: z.string().optional(),
}).refine((data) => {
  if (data.industry === "other" && !data.industryOther) {
    return false;
  }
  return true;
}, {
  message: "Please specify your industry",
  path: ["industryOther"],
});

// Step 3: Small Business Owner Schema
export const smallBusinessSchema = z.object({
  businessCategory: z.string().min(1, "Business category is required"),
  businessCategoryOther: z.string().optional(),
  companyName: z.string().min(1, "Company name is required"),
  businessDescription: z.string().max(150, "Description must be 150 characters or less"),
  businessStartDate: z.string().min(1, "Start date is required"),
  numberOfEmployees: z.string().min(1, "Number of employees is required"),
  incomeMethod: z.array(z.string()).min(1, "Select at least one income method"),
  incomeMethodOther: z.string().optional(),
}).refine((data) => {
  if (data.businessCategory === "other" && !data.businessCategoryOther) {
    return false;
  }
  return true;
}, {
  message: "Please specify your business category",
  path: ["businessCategoryOther"],
});

// Step 3: Digital Asset Trader Schema
export const digitalAssetSchema = z.object({
  assetTypes: z.array(z.string()).min(1, "Select at least one asset type"),
  assetTypesOther: z.string().optional(),
  tradingPlatforms: z.array(z.string()).min(1, "Add at least one trading platform"),
  tradingStartDate: z.string().min(1, "Start date is required"),
  incomeMethod: z.array(z.string()).min(1, "Select at least one earning method"),
  incomeMethodOther: z.string().optional(),
});

// Step 4: Confirmation Schema
export const confirmationSchema = z.object({
  confirmedAccuracy: z.boolean().refine(val => val === true, {
    message: "You must confirm the accuracy of your information",
  }),
  agreedToNotifications: z.boolean().refine(val => val === true, {
    message: "You must agree to receive notifications",
  }),
  agreedToTerms: z.boolean().refine(val => val === true, {
    message: "You must agree to the terms and conditions",
  }),
});

// Combined schema for the entire onboarding process
export const completeOnboardingSchema = z.object({
  // Step 1
  fullName: z.string(),
  phoneNumber: z.string(),
  email: z.string().email(),
  password: z.string(),
  howDidYouKnow: z.string(),
  howDidYouKnowOther: z.string().optional(),
  referralCode: z.string().optional(),
  
  // Step 2
  workType: z.string(),
  
  // Step 3 - Conditional fields based on work type
  // Self-Employed / Small Business
  businessCategory: z.string().optional(),
  businessCategoryOther: z.string().optional(),
  businessName: z.string().optional(),
  businessDescription: z.string().optional(),
  businessStartDate: z.string().optional(),
  
  // Freelancer
  freelanceCategory: z.string().optional(),
  freelanceCategoryOther: z.string().optional(),
  servicesDescription: z.string().optional(),
  freelanceStartDate: z.string().optional(),
  
  // Remote Worker
  industry: z.string().optional(),
  industryOther: z.string().optional(),
  employmentType: z.string().optional(),
  jobStartDate: z.string().optional(),
  
  // Small Business specific
  companyName: z.string().optional(),
  numberOfEmployees: z.string().optional(),
  
  // Digital Asset Trader
  assetTypes: z.array(z.string()).optional(),
  assetTypesOther: z.string().optional(),
  tradingPlatforms: z.array(z.string()).optional(),
  tradingStartDate: z.string().optional(),
  
  // Income/Payment methods (varies by type)
  incomeMethod: z.array(z.string()).optional(),
  incomeMethodOther: z.string().optional(),
  paymentMethod: z.array(z.string()).optional(),
  paymentMethodOther: z.string().optional(),
  
  // Step 4
  confirmedAccuracy: z.boolean(),
  agreedToNotifications: z.boolean(),
  agreedToTerms: z.boolean(),
});
