import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { validateRequest } from '@/lib/utils/validation';
import { AddBankAccountSchema } from '@/lib/validations/profile';

// PATCH /api/profile/bank-accounts/[id] - Update bank account
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);
    const data = await validateRequest(request, AddBankAccountSchema.partial());

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
    const accountIndex = bankDetails.findIndex((acc: any) => acc.id === id);

    if (accountIndex === -1) {
      return NextResponse.json(
        { message: 'Bank account not found' },
        { status: 404 }
      );
    }

    // If setting as default, unset all others
    let updatedBankDetails = bankDetails;
    if (data.isDefault) {
      updatedBankDetails = bankDetails.map((acc: any) => ({
        ...acc,
        isDefault: acc.id === id,
      }));
    }

    // Update the specific account
    updatedBankDetails[accountIndex] = {
      ...updatedBankDetails[accountIndex],
      ...data,
    };

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
        message: 'Bank account updated successfully',
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
    console.error('Update bank account error:', error);

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

// DELETE /api/profile/bank-accounts/[id] - Delete bank account
export async function DELETE(
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
    const updatedBankDetails = bankDetails.filter((acc: any) => acc.id !== id);

    // If deleted account was default and there are other accounts, make the first one default
    const deletedAccount = bankDetails.find((acc: any) => acc.id === id);
    if (deletedAccount?.isDefault && updatedBankDetails.length > 0) {
      updatedBankDetails[0].isDefault = true;
    }

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
        message: 'Bank account deleted successfully',
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
    console.error('Delete bank account error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
