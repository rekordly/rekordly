import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { validateRequest } from '@/lib/utils/validation';
import { UpdateBasicDetailsSchema } from '@/lib/validations/profile';

// GET /api/user/profile - Get user profile
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        activePackageId: true,
        packageStatus: true,
        packageStartDate: true,
        packageEndDate: true,
        onboarding: {
          select: {
            fullName: true,
            phoneNumber: true,
            heardFrom: true,
            referralCode: true,
            workTypes: true,
            registrationType: true,
            businessName: true,
            startDate: true,
            bankDetails: true,
          },
        },
        package: {
          select: {
            id: true,
            name: true,
            displayName: true,
            price: true,
            duration: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        profile: {
          ...user,
          phoneNumber: user.onboarding?.phoneNumber || null,
          activePackage: user.package,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get profile error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/user/profile/basic-details - Update basic details
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);
    const data = await validateRequest(request, UpdateBasicDetailsSchema);

    // Update user
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        activePackageId: true,
        packageStatus: true,
        packageStartDate: true,
        packageEndDate: true,
        onboarding: {
          select: {
            fullName: true,
            phoneNumber: true,
            heardFrom: true,
            referralCode: true,
            workTypes: true,
            registrationType: true,
            businessName: true,
            startDate: true,
            bankDetails: true,
          },
        },
        package: {
          select: {
            id: true,
            name: true,
            displayName: true,
            price: true,
            duration: true,
          },
        },
      },
    });

    // Update onboarding phone number
    if (user.onboarding) {
      await prisma.onboardingData.update({
        where: { userId },
        data: {
          phoneNumber: data.phoneNumber,
          fullName: data.name,
        },
      });
    }

    return NextResponse.json(
      {
        message: 'Profile updated successfully',
        success: true,
        profile: {
          ...user,
          phoneNumber: data.phoneNumber,
          activePackage: user.package,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update profile error:', error);

    if (error instanceof NextResponse) return error;

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
