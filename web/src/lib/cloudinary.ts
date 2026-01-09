import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;

export const MAX_IMAGE_SIZE = 100 * 1024;

export function extractPublicIdFromUrl(url: string): string | null {
  try {
    const urlParts = url.split('/');
    const uploadIndex = urlParts.indexOf('upload');
    if (uploadIndex === -1) return null;
    const pathParts = urlParts.slice(uploadIndex + 2);
    const publicIdWithExtension = pathParts.join('/');
    return publicIdWithExtension.replace(/\.[^/.]+$/, '');
  } catch {
    return null;
  }
}

interface UploadOptions {
  folder: string;
  publicId?: string;
  maxWidth?: number;
  maxHeight?: number;
  gravity?: string;
  quality?: number | 'auto:low';
}

async function uploadToCloudinary(
  file: File,
  options: UploadOptions,
  oldImageUrl?: string | null
): Promise<{ url: string; publicId: string }> {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) throw new Error('Invalid file type');

  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) throw new Error('File too large');

  if (oldImageUrl) {
    const oldPublicId = extractPublicIdFromUrl(oldImageUrl);
    if (oldPublicId)
      await cloudinary.uploader.destroy(oldPublicId).catch(console.error);
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.publicId,
        resource_type: 'image',
        transformation: [
          {
            width: options.maxWidth,
            height: options.maxHeight,
            crop: options.gravity ? 'fill' : 'limit',
            gravity: options.gravity,
          },
          { quality: options.quality || 'auto:low', fetch_format: 'webp' },
        ],
      },
      (error, result) => {
        if (error || !result) reject(error || new Error('Upload failed'));
        else if (result.bytes > MAX_IMAGE_SIZE)
          console.warn(
            `Image size ${(result.bytes / 1024).toFixed(2)}KB exceeds 100KB`
          );
        else resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
}

export async function uploadProfileImage(
  file: File,
  userId: string,
  oldImageUrl?: string | null
): Promise<{ url: string; publicId: string }> {
  return uploadToCloudinary(
    file,
    {
      folder: 'user-profiles',
      publicId: `profile_${userId}_${Date.now()}`,
      maxWidth: 400,
      maxHeight: 400,
      gravity: 'face',
      quality: 'auto:low',
    },
    oldImageUrl
  );
}

export async function uploadInventoryImage(
  file: File,
  userId: string,
  oldImageUrl?: string | null
): Promise<{ url: string; publicId: string }> {
  return uploadToCloudinary(
    file,
    {
      folder: `inventory/${userId}`,
      maxWidth: 800,
      maxHeight: 800,
      quality: 60,
    },
    oldImageUrl
  );
}

export async function deleteImage(imageUrl: string): Promise<void> {
  const publicId = extractPublicIdFromUrl(imageUrl);
  if (!publicId) throw new Error('Invalid image URL');
  await cloudinary.uploader.destroy(publicId);
}
