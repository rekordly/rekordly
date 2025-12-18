import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { validateRequest } from '@/lib/utils/validation';
import { UpdateWorkDetailsSchema } from '@/lib/validations/profile';

// PATCH /api/user/profile/work-details - Update work details
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);
    const data = await validateRequest(request, UpdateWorkDetailsSchema);

    // Check if onboarding data exists
    const onboarding = await prisma.onboardingData.findUnique({
      where: { userId },
    });

    if (!onboarding) {
      return NextResponse.json(
        { message: 'Onboarding data not found' },
        { status: 404 }
      );
    }

    // Update onboarding data
    await prisma.onboardingData.update({
      where: { userId },
      data: {
        registrationType: data.registrationType,
        businessName: data.businessName || null,
        workTypes: data.workTypes,
        startDate: new Date(data.startDate),
      },
    });

    // Fetch updated user profile
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

    return NextResponse.json(
      {
        message: 'Work details updated successfully',
        success: true,
        profile: {
          ...user,
          phoneNumber: user?.onboarding?.phoneNumber || null,
          activePackage: user?.package,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update work details error:', error);

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
