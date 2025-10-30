import NextAuth, { DefaultSession } from 'next-auth';
import { JWT } from 'next-auth/jwt';

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
        workType: string | null;
        startDate: string | Date | null;
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
      workType: string | null;
      startDate: string | Date | null;
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
      workType: string | null;
      startDate: string | Date | null;
    };
  }
}
