import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { UpdateInventoryItemSchema } from '@/lib/validations/inventory';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { deleteImage, uploadInventoryImage } from '@/lib/cloudinary';

// GET /api/inventory-items/[id] - Get single inventory item with details
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        saleItems: {
          include: {
            sale: {
              select: {
                id: true,
                receiptNumber: true,
                saleDate: true,
                totalAmount: true,
              },
            },
          },
          orderBy: {
            sale: {
              saleDate: 'desc',
            },
          },
          take: 5,
        },
        stockAdjustments: {
          orderBy: {
            adjustmentDate: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!inventoryItem) {
      return NextResponse.json(
        { message: 'Inventory item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        inventoryItem,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get inventory item error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/inventory-items/[id] - Update inventory item

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if inventory item exists and belongs to user
    const existingItem = await prisma.inventoryItem.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existingItem) {
      return NextResponse.json(
        { message: 'Inventory item not found' },
        { status: 404 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    console.log('Form Data:', JSON.stringify(formData, null, 2));

    // Extract JSON data
    const jsonData = formData.get('data') as string;
    const file = formData.get('file') as File | null;
    const removeImage = formData.get('removeImage') === 'true';

    let data: any = {};

    // If there's JSON data, parse and validate it
    if (jsonData) {
      const parsedData = JSON.parse(jsonData);
      data = UpdateInventoryItemSchema.parse(parsedData);
    }

    // Check if SKU is being updated and if it's unique
    if (
      data.sku !== undefined &&
      data.sku.trim() !== '' &&
      data.sku !== existingItem.sku
    ) {
      const existingSku = await prisma.inventoryItem.findFirst({
        where: {
          userId,
          sku: data.sku.trim(),
          id: { not: id },
        },
      });

      if (existingSku) {
        return NextResponse.json(
          { message: 'SKU already exists for another inventory item' },
          { status: 400 }
        );
      }
    }

    // Handle image upload/removal
    let imageUrl: string | null = existingItem.storefrontImage;

    if (file) {
      // Upload new image (replaces old one)
      try {
        const uploadResult = await uploadInventoryImage(
          file,
          userId,
          existingItem.storefrontImage
        );
        imageUrl = uploadResult.url;
      } catch (error: any) {
        return NextResponse.json(
          { message: error.message || 'Failed to upload image' },
          { status: 400 }
        );
      }
    } else if (removeImage && existingItem.storefrontImage) {
      // Remove existing image
      try {
        await deleteImage(existingItem.storefrontImage);
        imageUrl = null;
      } catch (error: any) {
        console.error('Failed to delete image:', error);
        // Continue without image - don't fail the whole update
      }
    }
    // If no file and no removeImage flag, keep existing image

    // Build update data object
    const updateData: any = {};

    if (data.itemType !== undefined) updateData.itemType = data.itemType;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description || null;
    if (data.category !== undefined)
      updateData.category = data.category || null;
    if (data.sku !== undefined) {
      updateData.sku =
        data.sku && data.sku.trim() !== '' ? data.sku.trim() : null;
    }
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.trackInventory !== undefined)
      updateData.trackInventory = data.trackInventory;

    if (data.reorderLevel !== undefined) {
      updateData.reorderLevel = toTwoDecimals(data.reorderLevel);
    }
    if (data.reorderQuantity !== undefined) {
      updateData.reorderQuantity = toTwoDecimals(data.reorderQuantity);
    }
    if (data.averageCost !== undefined) {
      updateData.averageCost = toTwoDecimals(data.averageCost);
    }
    if (data.lastPurchaseCost !== undefined) {
      updateData.lastPurchaseCost = toTwoDecimals(data.lastPurchaseCost);
    }
    if (data.sellingPrice !== undefined) {
      updateData.sellingPrice = toTwoDecimals(data.sellingPrice);
    }
    if (data.showOnStorefront !== undefined) {
      updateData.showOnStorefront = data.showOnStorefront;
    }

    // Always update imageUrl (it's either new, null, or existing)
    updateData.storefrontImage = imageUrl;

    if (data.storefrontOrder !== undefined) {
      updateData.storefrontOrder = data.storefrontOrder;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    // Update inventory item
    const updatedItem = await prisma.inventoryItem.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(
      {
        message: 'Inventory item updated successfully',
        success: true,
        inventoryItem: updatedItem,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update inventory item error:', error);

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

// DELETE /api/inventory-items/[id] - Delete inventory item
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if inventory item exists and belongs to user
    const existingItem = await prisma.inventoryItem.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        saleItems: true,
        productionInputs: true,
      },
    });

    if (!existingItem) {
      return NextResponse.json(
        { message: 'Inventory item not found' },
        { status: 404 }
      );
    }

    // // Check if item is referenced by sales, purchases, or productions
    // const hasReferences =
    //   existingItem.purchaseItems.length > 0 ||
    //   existingItem.saleItems.length > 0 ||
    //   existingItem.productionInputs.length > 0;

    // if (hasReferences) {
    //   return NextResponse.json(
    //     {
    //       message:
    //         'Cannot delete inventory item. It is referenced by sales, purchases, or productions.',
    //       references: {
    //         purchases: existingItem.purchaseItems.length,
    //         sales: existingItem.saleItems.length,
    //         productions: existingItem.productionInputs.length,
    //       },
    //     },
    //     { status: 400 }
    //   );
    // }

    // Delete inventory item (stock adjustments will be cascade deleted)
    await prisma.inventoryItem.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        message: 'Inventory item deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete inventory item error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
