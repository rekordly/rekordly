import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';

// PATCH /api/user/profile/bank-accounts/[id]/set-default - Set default bank account
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const onboarding = await prisma.onboardingData.findUnique({
      where: { userId },
      select: { bankDetails: true },
    });

    if (!onboarding) {
      return NextResponse.json(
        { message: 'Onboarding data not found' },
        { status: 404 }
      );
    }

    const bankDetails = (onboarding.bankDetails as any[]) || [];
    const accountExists = bankDetails.some((acc: any) => acc.id === id);

    if (!accountExists) {
      return NextResponse.json(
        { message: 'Bank account not found' },
        { status: 404 }
      );
    }

    // Set all accounts to not default, then set the selected one as default
    const updatedBankDetails = bankDetails.map((acc: any) => ({
      ...acc,
      isDefault: acc.id === id,
    }));

    await prisma.onboardingData.update({
      where: { userId },
      data: { bankDetails: updatedBankDetails },
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
        message: 'Default bank account set successfully',
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
    console.error('Set default bank account error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
