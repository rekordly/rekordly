// app/api/verify-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyOtpCode } from "@/lib/auth/otp";
import { prisma } from "@/lib/prisma";
import { signIn } from "next-auth/react";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    console.log("Verifying OTP for:", email, code);
    
    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    const verification = await verifyOtpCode(email, code, "login_recovery");

    if (!verification.valid) {
      return NextResponse.json({ error: verification.error || "Invalid code" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, image: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // After successful OTP verification, we need to create a session
    // We'll use NextAuth.js to sign in the user
    // This is a simplified approach - in production, you might want to handle this differently
    return NextResponse.json(
      { 
        success: true, 
        user, 
        message: "Code verified successfully",
        // Include any additional data needed for session creation
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
  }
}