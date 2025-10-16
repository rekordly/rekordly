// lib/auth/otpAuth.ts
import { Provider } from "next-auth/providers";
import { prisma } from "@/lib/prisma";
import { verifyOtpCode } from "@/lib/auth/otp";
import { User } from "next-auth";

export const OTPProvider: Provider = {
  id: "otp",
  name: "OTP",
  type: "credentials" as const, // Use 'as const' to ensure literal type
  credentials: {
    email: { label: "Email", type: "email" },
    otp: { label: "OTP", type: "text" },
  },
  async authorize(credentials): Promise<User | null> {
    if (!credentials?.email || !credentials?.otp) {
      throw new Error("Missing credentials");
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email: credentials.email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          emailVerified: true,
          onboarded: true,
          password: true, // This line was missing
        },
      });

      if (!user) {
        throw new Error("No user found");
      }

      const verification = await verifyOtpCode(credentials.email, credentials.otp, "login_recovery");

      if (!verification.valid) {
        throw new Error("Invalid or expired code");
      }

      // Mark email as verified if not already
      if (!user.emailVerified) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }

      // Return only the fields expected by NextAuth User type
      return {
        id: user.id,
        email: user.email!,
        name: user.name ?? undefined,
        image: user.image ?? undefined,
        emailVerified: user.emailVerified ?? undefined,
      };
    } catch (error) {
      // Handle database connection errors gracefully
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error("An error occurred during OTP verification");
    }
  },
};