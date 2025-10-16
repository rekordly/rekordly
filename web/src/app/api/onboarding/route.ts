import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const prisma = new PrismaClient();

// Validation schemas
const personalInfoSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  heardFrom: z.string().min(1, 'Please select how you heard about us'),
  referralCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const workTypeSchema = z.object({
  workType: z.enum(['self-employed', 'freelancer', 'remote-worker', 'business-owner', 'digital-trader']),
});

const confirmationSchema = z.object({
  confirmAccuracy: z.boolean().refine((val) => val === true, {
    message: 'You must confirm the accuracy of information',
  }),
  confirmNotifications: z.boolean(),
  confirmTerms: z.boolean().refine((val) => val === true, {
    message: 'You must agree to terms and conditions',
  }),
});

const onboardingSchema = personalInfoSchema
  .and(workTypeSchema)
  .and(confirmationSchema)
  .and(z.object({
    // Work type specific fields
    businessType: z.string().optional(),
    businessTypeOther: z.string().optional(),
    freelanceType: z.string().optional(),
    industry: z.string().optional(),
    registrationType: z.string().optional(),
    businessName: z.string().optional(),
    companyName: z.string().optional(),
    description: z.string().max(150).optional(),
    startDate: z.string().optional(),
    employmentType: z.string().optional(),
    employeeCount: z.string().optional(),
    assetType: z.string().optional(),
    platforms: z.string().optional(),
    earningMethods: z.array(z.string()).optional(),
    paymentMethods: z.array(z.string()).optional(),
  }));

export async function POST(request: NextRequest) {
  try {
    // Get JWT token from request
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // Alternative: Get JWT from Authorization header
    // const authHeader = request.headers.get('authorization');
    // if (!authHeader?.startsWith('Bearer ')) {
    //   return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    // }
    // const jwtToken = authHeader.substring(7);

    if (!token) {
      return NextResponse.json(
        { message: 'Unauthorized - No valid session' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate data
    const validationResult = onboardingSchema.safeParse(body);
    
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

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user is already onboarded
    if (user.onboarded) {
      return NextResponse.json(
        { message: 'User already onboarded' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 12);

    // Prepare work type specific data
    const workTypeData = prepareWorkTypeData(data);

    // Update user with onboarding data
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: data.fullName,
        email: data.email,
        password: hashedPassword,
        onboarded: true,
        // Note: You'll need to create additional fields in your Prisma schema
        // to store work type specific data, or create separate related tables
      },
    });

    // Store work type specific data (you may want to create separate tables for this)
    // await prisma.userProfile.create({
    //   data: {
    //     userId: user.id,
    //     phoneNumber: data.phoneNumber,
    //     heardFrom: data.heardFrom,
    //     referralCode: data.referralCode,
    //     workType: data.workType,
    //     ...workTypeData,
    //   },
    // });

    return NextResponse.json(
      { 
        message: 'Onboarding completed successfully',
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          onboarded: updatedUser.onboarded,
        }
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Onboarding error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Validation error', errors: error.errors },
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

// Helper function to prepare work type specific data
function prepareWorkTypeData(data: any) {
  const baseData = {
    workType: data.workType,
    description: data.description,
    startDate: data.startDate,
    earningMethods: data.earningMethods,
  };

  switch (data.workType) {
    case 'self-employed':
      return {
        ...baseData,
        businessType: data.businessType,
        businessTypeOther: data.businessTypeOther,
        registrationType: data.registrationType,
        businessName: data.businessName,
      };

    case 'freelancer':
      return {
        ...baseData,
        freelanceType: data.freelanceType,
        registrationType: data.registrationType,
      };

    case 'remote-worker':
      return {
        ...baseData,
        industry: data.industry,
        employmentType: data.employmentType,
        paymentMethods: data.paymentMethods,
      };

    case 'business-owner':
      return {
        ...baseData,
        industry: data.industry,
        registrationType: data.registrationType,
        companyName: data.companyName,
        employeeCount: data.employeeCount,
      };

    case 'digital-trader':
      return {
        ...baseData,
        assetType: data.assetType,
        registrationType: data.registrationType,
        platforms: data.platforms,
      };

    default:
      return baseData;
  }
}

// GET endpoint to check onboarding status
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    if (!token?.email) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: token.email },
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