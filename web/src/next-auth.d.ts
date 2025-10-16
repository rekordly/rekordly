// src/next-auth.d.ts
import NextAuth, { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      onboarded: boolean;
      hasPassword: boolean;
      emailVerified: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    name?: string;
    image?: string;
    password?: string;
    onboarded?: boolean;
    emailVerified?: Date | null;    
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    onboarded: boolean;
    hasPassword: boolean;
    emailVerified: boolean;
  }
}