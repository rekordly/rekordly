import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  personalInfoSchema,
  personalInfoSchemaWithPassword,
  workTypeSchema,
  finalSchema
} from '@/lib/validations/onboarding';
import { z } from 'zod';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    // Try to get token from next-auth
    let token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    let userId: string | undefined;
    let userEmail: string | undefined;

    // If no next-auth token, try Authorization header (for mobile)
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const jwtToken = authHeader.substring(7);
        // Verify and decode the JWT token
        token = await getToken({ 
          req: { 
            headers: { authorization: `Bearer ${jwtToken}` } 
          } as any, 
          secret: process.env.NEXTAUTH_SECRET 
        });
      }
    }

    if (!token?.sub || !token?.email) {
      return NextResponse.json(
        { message: 'Unauthorized - No valid session or token' },
        { status: 401 }
      );
    }

    userId = token.sub;
    userEmail = token.email;

    // Parse request body
    const body = await request.json();

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { onboarding: true }
    });

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user is already onboarded
    if (user.onboarded || user.onboarding) {
      return NextResponse.json(
        { message: 'User already onboarded' },
        { status: 400 }
      );
    }

    // Determine which schema to use based on user's password status
    const hasPassword = !!user.password;
    const step1Schema = hasPassword ? personalInfoSchema : personalInfoSchemaWithPassword;
    
    // Create combined schema
    const completeSchema = step1Schema.merge(workTypeSchema).merge(finalSchema);

    // Validate data
    const validationResult = completeSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          message: 'Validation failed', 
          errors: validationResult.error.flatten().fieldErrors 
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Prepare update data for User table
    const userUpdateData: any = {
      name: data.fullName,
      onboarded: true,
    };

    // Only update password if user doesn't have one and password is provided
    if (!hasPassword && data.password) {
      const hashedPassword = await bcrypt.hash(data.password, 12);
      userUpdateData.password = hashedPassword;
    }

    // Use transaction to update user and create onboarding data
    const result = await prisma.$transaction(async (tx) => {
      // Update user
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: userUpdateData,
      });

      // Create onboarding data
      const onboardingData = await tx.onboardingData.create({
        data: {
          userId: userId!,
          fullName: data.fullName,
          phoneNumber: data.phoneNumber,
          heardFrom: data.heardFrom,
          referralCode: data.referralCode || null,
          workType: data.workType,
          registrationType: data.registrationType,
          businessName: data.businessName || null,
          startDate: new Date(data.startDate),
          notificationsEnabled: data.confirmNotifications || false,
          termsAccepted: data.confirmTerms,
        },
      });

      return { updatedUser, onboardingData };
    });

    return NextResponse.json(
      { 
        message: 'Onboarding completed successfully',
        success: true,
        user: {
          id: result.updatedUser.id,
          name: result.updatedUser.name,
          email: result.updatedUser.email,
          onboarded: result.updatedUser.onboarded,
        }
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Onboarding error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Validation error', errors: error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// GET endpoint to check onboarding status
export async function GET(request: NextRequest) {
  try {
    // Try to get token from next-auth
    let token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

    // If no next-auth token, try Authorization header (for mobile)
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const jwtToken = authHeader.substring(7);
        token = await getToken({ 
          req: { 
            headers: { authorization: `Bearer ${jwtToken}` } 
          } as any, 
          secret: process.env.NEXTAUTH_SECRET 
        });
      }
    }
    
    if (!token?.sub) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: token.sub },
      select: {
        id: true,
        name: true,
        email: true,
        onboarded: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user }, { status: 200 });

  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}