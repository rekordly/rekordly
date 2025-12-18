import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      onboarded: boolean;
      hasPassword: boolean;
      emailVerified: boolean;
      onboarding?: {
        businessName: string | null;
        phoneNumber: string | null;
        registrationType: string | null;
        workTypes: Array | null;
        startDate: string | Date | null;
        bankDetails?: Array | null;
        referralCode?: string | null;
      };
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    password?: string | null;
    onboarded?: boolean;
    emailVerified?: Date | null;
    hasPassword: boolean;
    onboarding?: {
      businessName: string | null;
      phoneNumber: string | null;
      registrationType: string | null;
      workTypes: Array | null;
      startDate: string | Date | null;
      bankDetails?: Array | null;
      referralCode?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    onboarded: boolean;
    hasPassword: boolean;
    emailVerified: boolean;
    onboarding?: {
      businessName: string | null;
      phoneNumber: string | null;
      registrationType: string | null;
      workTypes: Array | null;
      startDate: string | Date | null;
      bankDetails?: Array | null;
      referralCode?: string | null;
    };
  }
}
