// lib/cloudinary.ts

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;

// Helper function to upload image with compression
export async function uploadProfileImage(
  file: File,
  userId: string,
  oldImageUrl?: string | null
): Promise<{ url: string; publicId: string }> {
  try {
    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;

    // Delete old image if exists
    if (oldImageUrl) {
      const publicId = extractPublicIdFromUrl(oldImageUrl);
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (error) {
          console.error('Failed to delete old image:', error);
        }
      }
    }

    // Upload with compression and transformations
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'user-profiles',
      public_id: `profile_${userId}_${Date.now()}`,
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto:low', fetch_format: 'auto' },
      ],
      format: 'jpg',
    });

    // Check if compressed size is within limits (50-100kb)
    const imageSizeKb = result.bytes / 1024;

    if (imageSizeKb > 100) {
      // Try more aggressive compression
      const compressedResult = await cloudinary.uploader.upload(dataUri, {
        folder: 'user-profiles',
        public_id: `profile_${userId}_${Date.now()}_compressed`,
        resource_type: 'image',
        transformation: [
          { width: 300, height: 300, crop: 'fill', gravity: 'face' },
          { quality: '60', fetch_format: 'auto' },
        ],
        format: 'jpg',
      });

      const compressedSizeKb = compressedResult.bytes / 1024;

      if (compressedSizeKb > 100) {
        // Delete the uploaded images
        await cloudinary.uploader.destroy(result.public_id);
        await cloudinary.uploader.destroy(compressedResult.public_id);
        throw new Error(
          'File too large. Even after compression, the image exceeds 100KB. Please use a smaller image.'
        );
      }

      // Delete the first attempt, use compressed version
      await cloudinary.uploader.destroy(result.public_id);

      return {
        url: compressedResult.secure_url,
        publicId: compressedResult.public_id,
      };
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error: any) {
    console.error('Cloudinary upload error:', error);
    throw new Error(error.message || 'Failed to upload image');
  }
}

// Helper to extract public_id from Cloudinary URL
function extractPublicIdFromUrl(url: string): string | null {
  try {
    // Example URL: https://res.cloudinary.com/dz6mwizhh/image/upload/v1234567890/user-profiles/profile_123.jpg
    const urlParts = url.split('/');
    const uploadIndex = urlParts.indexOf('upload');

    if (uploadIndex !== -1 && urlParts.length > uploadIndex + 2) {
      // Get everything after 'upload/v{version}/'
      const pathParts = urlParts.slice(uploadIndex + 2);
      const publicIdWithExtension = pathParts.join('/');

      // Remove file extension
      const publicId = publicIdWithExtension.replace(/\.[^/.]+$/, '');
      return publicId;
    }

    return null;
  } catch (error) {
    console.error('Failed to extract public_id:', error);
    return null;
  }
}

export { extractPublicIdFromUrl };
