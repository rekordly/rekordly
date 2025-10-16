import * as z from "zod";
import {
  HowDidYouKnowEnum,
  WorkTypeEnum,
  completeOnboardingSchema,
  confirmationSchema,
  digitalAssetSchema,
  freelancerSchema,
  remoteWorkerSchema,
  selfEmployedSchema,
  smallBusinessSchema,
  step1Schema,
  step2Schema
} from "@/lib/schemas/onboarding.schema";

export type Step1Data = z.infer<typeof step1Schema>;
export type Step2Data = z.infer<typeof step2Schema>;
export type SelfEmployedData = z.infer<typeof selfEmployedSchema>;
export type FreelancerData = z.infer<typeof freelancerSchema>;
export type RemoteWorkerData = z.infer<typeof remoteWorkerSchema>;
export type SmallBusinessData = z.infer<typeof smallBusinessSchema>;
export type DigitalAssetData = z.infer<typeof digitalAssetSchema>;
export type ConfirmationData = z.infer<typeof confirmationSchema>;
export type CompleteOnboardingData = z.infer<typeof completeOnboardingSchema>;

// Options for dropdowns
export const howDidYouKnowOptions = [
  { value: HowDidYouKnowEnum.SOCIAL_MEDIA, label: "Social Media" },
  { value: HowDidYouKnowEnum.FRIEND, label: "Friend/Colleague" },
  { value: HowDidYouKnowEnum.SEARCH_ENGINE, label: "Search Engine" },
  { value: HowDidYouKnowEnum.ADVERTISEMENT, label: "Advertisement" },
  { value: HowDidYouKnowEnum.BLOG, label: "Blog/Article" },
  { value: HowDidYouKnowEnum.OTHER, label: "Other" },
];

export const businessCategories = [
  { value: "retail", label: "Retail & Sales" },
  { value: "food", label: "Food & Hospitality" },
  { value: "fashion", label: "Fashion & Beauty" },
  { value: "professional", label: "Professional Services" },
  { value: "creative", label: "Creative & Design" },
  { value: "tech", label: "Technology & IT" },
  { value: "education", label: "Education & Training" },
  { value: "health", label: "Health & Wellness" },
  { value: "transport", label: "Transportation & Logistics" },
  { value: "manufacturing", label: "Manufacturing & Production" },
  { value: "other", label: "Other (Please specify)" },
];

export const freelanceCategories = [
  { value: "creative", label: "Creative Services" },
  { value: "tech", label: "Technology Services" },
  { value: "professional", label: "Professional Services" },
  { value: "marketing", label: "Digital Marketing" },
  { value: "media", label: "Media & Entertainment" },
  { value: "education", label: "Education & Training" },
  { value: "translation", label: "Translation & Language" },
  { value: "admin", label: "Administrative & Virtual Assistance" },
  { value: "other", label: "Other (Please specify)" },
];

export const industries = [
  { value: "tech", label: "Technology & IT" },
  { value: "finance", label: "Finance & Banking" },
  { value: "customer_service", label: "Customer Service" },
  { value: "marketing", label: "Marketing & Communications" },
  { value: "admin", label: "Administration & Operations" },
  { value: "creative", label: "Creative & Design" },
  { value: "education", label: "Education & Training" },
  { value: "healthcare", label: "Healthcare" },
  { value: "other", label: "Other (Please specify)" },
];

export const employeeCountOptions = [
  { value: "1", label: "Just me" },
  { value: "2-5", label: "2-5 employees" },
  { value: "6-10", label: "6-10 employees" },
  { value: "11-20", label: "11-20 employees" },
  { value: "21-50", label: "21-50 employees" },
  { value: "50+", label: "More than 50 employees" },
];

export const selfEmployedIncomeOptions = [
  { value: "products", label: "Selling products" },
  { value: "services", label: "Providing services" },
  { value: "rental", label: "Renting out property/equipment" },
  { value: "interest", label: "Interest from loans/investments" },
  { value: "royalties", label: "Royalties from intellectual property" },
  { value: "commissions", label: "Commissions from sales" },
  { value: "other", label: "Other" },
];

export const freelancerPaymentOptions = [
  { value: "project", label: "Project-based payments" },
  { value: "hourly", label: "Hourly rates" },
  { value: "retainer", label: "Monthly retainers" },
  { value: "content", label: "Digital content creation" },
  { value: "teaching", label: "Online teaching" },
  { value: "other", label: "Other" },
];

export const remoteWorkerPaymentOptions = [
  { value: "salary", label: "Salary/Wages" },
  { value: "allowances", label: "Allowances" },
  { value: "bonuses", label: "Bonuses" },
  { value: "benefits", label: "Benefits-in-kind" },
  { value: "other", label: "Other" },
];

export const digitalAssetTypes = [
  { value: "crypto", label: "Cryptocurrency (Bitcoin, Ethereum, etc.)" },
  { value: "nft", label: "NFTs (Non-Fungible Tokens)" },
  { value: "tokens", label: "Tokens (Security, utility, governance)" },
  { value: "other", label: "Other digital assets" },
];

export const digitalAssetIncomeOptions = [
  { value: "trading", label: "Buying and selling for profit" },
  { value: "staking", label: "Staking rewards" },
  { value: "mining", label: "Mining rewards" },
  { value: "airdrops", label: "Airdrops" },
  { value: "other", label: "Other" },
];