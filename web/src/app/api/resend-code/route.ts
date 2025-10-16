import { NextRequest, NextResponse } from "next/server";
import { sendOtpCode } from "@/lib/auth/otp";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "No user found with this email" }, { status: 404 });
    }

    // Rate limiting - prevent spam
    const recentOtp = await prisma.otpCode.findFirst({
      where: {
        email,
        purpose: "login_recovery",
        createdAt: { gt: new Date(Date.now() - 30 * 1000) },
      },
    });

    if (recentOtp) {
      return NextResponse.json(
        { error: "Please wait before requesting another code" },
        { status: 429 }
      );
    }

    await sendOtpCode(email, "login_recovery");

    return NextResponse.json({ message: "Verification code sent successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error resending OTP:", error);
    return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 });
  }
}