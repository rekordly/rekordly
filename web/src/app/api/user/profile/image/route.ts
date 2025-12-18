import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { uploadProfileImage } from '@/lib/cloudinary';

// POST /api/user/profile/image - Upload profile image
export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    // Get current user to check for existing image
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });

    if (!currentUser) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { message: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { message: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB before compression)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { message: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      );
    }

    // Upload to Cloudinary with compression
    const { url } = await uploadProfileImage(file, userId, currentUser.image);

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { image: url },
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
        message: 'Profile image updated successfully',
        success: true,
        profile: {
          ...updatedUser,
          phoneNumber: updatedUser.onboarding?.phoneNumber || null,
          activePackage: updatedUser.package,
        },
        imageUrl: url,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Upload profile image error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    if (error.message?.includes('File too large')) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: 'Failed to upload image' },
      { status: 500 }
    );
  }
}

// DELETE /api/user/profile/image - Delete profile image
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });

    if (!currentUser) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Delete from Cloudinary if exists
    if (currentUser.image) {
      const { extractPublicIdFromUrl } = await import('@/lib/cloudinary');
      const publicId = extractPublicIdFromUrl(currentUser.image);

      if (publicId) {
        const cloudinary = (await import('@/lib/cloudinary')).default;
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (error) {
          console.error('Failed to delete from Cloudinary:', error);
        }
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { image: null },
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
        message: 'Profile image deleted successfully',
        success: true,
        profile: {
          ...updatedUser,
          phoneNumber: updatedUser.onboarding?.phoneNumber || null,
          activePackage: updatedUser.package,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete profile image error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Failed to delete image' },
      { status: 500 }
    );
  }
}
