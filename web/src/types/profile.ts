// @/types/profile.ts

import { z } from 'zod';
import {
  UpdateBasicDetailsSchema,
  UpdateWorkDetailsSchema,
  UpdateAgencyDetailsSchema,
  AddBankAccountSchema,
} from '@/lib/validations/profile';

// Inferred types from schemas
export type UpdateBasicDetailsType = z.infer<typeof UpdateBasicDetailsSchema>;
export type UpdateWorkDetailsType = z.infer<typeof UpdateWorkDetailsSchema>;
export type UpdateAgencyDetailsType = z.infer<typeof UpdateAgencyDetailsSchema>;
export type AddBankAccountType = z.infer<typeof AddBankAccountSchema>;

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
}

export interface ProfileData {
  // User details
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  phoneNumber: string | null;

  // Package details
  activePackage: {
    id: string;
    name: string;
    displayName: string;
    price: number;
    duration: number;
  } | null;
  packageStatus: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  packageStartDate: Date | null;
  packageEndDate: Date | null;

  // Onboarding details
  onboarding: {
    fullName: string;
    phoneNumber: string;
    heardFrom: string;
    referralCode: string | null;
    workTypes: string[];
    registrationType: string;
    businessName: string | null;
    startDate: Date;
    bankDetails: BankAccount[] | null;
  } | null;
}

export interface ProfileStore {
  profile: ProfileData | null;
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;

  // Actions
  fetchProfile: () => Promise<void>;
  updateBasicDetails: (data: UpdateBasicDetailsType) => Promise<void>;
  updateWorkDetails: (data: UpdateWorkDetailsType) => Promise<void>;
  updateProfileImage: (file: File) => Promise<void>;
  deleteProfileImage: () => Promise<void>;
  addBankAccount: (data: AddBankAccountType) => Promise<void>;
  updateBankAccount: (
    id: string,
    data: Partial<AddBankAccountType>
  ) => Promise<void>;
  deleteBankAccount: (id: string) => Promise<void>;
  setDefaultBankAccount: (id: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  reset: () => void;
}
