import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { validateRequest } from '@/lib/utils/validation';
import { AddBankAccountSchema } from '@/lib/validations/profile';

// POST /api/profile/bank-accounts - Add bank account
export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);
    const data = await validateRequest(request, AddBankAccountSchema);

    // Get current bank details
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

    const currentBankDetails = (onboarding.bankDetails as any[]) || [];

    // If this is the first account or marked as default, set all others to not default
    const newBankDetails = data.isDefault
      ? currentBankDetails.map((acc: any) => ({ ...acc, isDefault: false }))
      : currentBankDetails;

    // Add new bank account
    const newAccount = {
      id: `bank_${Date.now()}`,
      ...data,
      isDefault: data.isDefault || currentBankDetails.length === 0,
    };

    newBankDetails.push(newAccount);

    // Update onboarding data
    await prisma.onboardingData.update({
      where: { userId },
      data: { bankDetails: newBankDetails },
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
        message: 'Bank account added successfully',
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
    console.error('Add bank account error:', error);

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
