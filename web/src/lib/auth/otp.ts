import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import nodemailer from "nodemailer";

export function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function sendOtpCode(email: string, purpose: string = "login_recovery") {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 10* 30 * 1000);

  await prisma.otpCode.deleteMany({
    where: { email, purpose, used: false },
  });

  await prisma.otpCode.create({
    data: { email, code, purpose, expiresAt },
  });

  await sendOtpEmail(email, code);
  return { success: true };
}

// lib/auth/otp.ts
export async function verifyOtpCode(email: string, code: string, purpose: string = "login_recovery") {
  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      email,
      code,
      purpose,
      used: false,
      expiresAt: { gt: new Date() },
    },
  });

  if (!otpRecord) {
    return { valid: false, error: "Invalid or expired code" };
  }

  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { used: true },
  });

  // If this is for login, also mark the email as verified if it's not already
  if (purpose === "login_recovery") {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user && !user.emailVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    }
  }

  return { valid: true };
}

async function sendOtpEmail(email: string, code: string) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT),
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Your verification code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your Verification Code</h2>
        <p>You requested to sign in to your account. Use the code below to continue:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
          ${code}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `,
  });
}