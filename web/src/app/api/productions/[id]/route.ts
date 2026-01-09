// app/api/productions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { UpdateProductionSchema } from '@/lib/validations/production';
import { deleteImage, uploadInventoryImage } from '@/lib/cloudinary';
import { toTwoDecimals } from '@/lib/fn';

// GET /api/productions/[id] - Get single production with full details
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const production = await prisma.production.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        recipe: {
          include: {
            ingredients: {
              include: {
                inventoryItem: true,
              },
            },
          },
        },
        outputInventory: true,
        inputs: {
          include: {
            inventoryItem: true,
          },
        },
        sale: {
          select: {
            id: true,
            receiptNumber: true,
            saleDate: true,
            totalAmount: true,
          },
        },
      },
    });

    if (!production) {
      return NextResponse.json(
        { message: 'Production not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        production,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get production error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/productions/[id] - Update production
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if production exists and belongs to user
    const existingProduction = await prisma.production.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existingProduction) {
      return NextResponse.json(
        { message: 'Production not found' },
        { status: 404 }
      );
    }

    // Don't allow updating COMPLETED productions (inventory already adjusted)
    if (existingProduction.status === 'COMPLETED') {
      return NextResponse.json(
        {
          message:
            'Cannot update completed production. Inventory has already been adjusted.',
        },
        { status: 400 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const removeImage = formData.get('removeImage') === 'true';

    // Extract JSON data
    const jsonData = formData.get('data') as string;
    let data: any = {};

    if (jsonData) {
      const parsedData = JSON.parse(jsonData);
      data = UpdateProductionSchema.parse(parsedData);
    }

    // Handle image upload/removal
    let imageUrl: string | null = existingProduction.outputImage;

    if (file) {
      try {
        const uploadResult = await uploadInventoryImage(
          file,
          userId,
          existingProduction.outputImage
        );
        imageUrl = uploadResult.url;
      } catch (error: any) {
        return NextResponse.json(
          { message: error.message || 'Failed to upload image' },
          { status: 400 }
        );
      }
    } else if (removeImage && existingProduction.outputImage) {
      try {
        await deleteImage(existingProduction.outputImage);
        imageUrl = null;
      } catch (error: any) {
        console.error('Failed to delete image:', error);
      }
    }

    // Build update data
    const updateData: any = {};

    if (data.title !== undefined) updateData.title = data.title || null;
    if (data.description !== undefined)
      updateData.description = data.description || null;
    if (data.productionDate !== undefined)
      updateData.productionDate = new Date(data.productionDate);
    if (data.outputItemName !== undefined)
      updateData.outputItemName = data.outputItemName;
    if (data.outputQuantity !== undefined)
      updateData.outputQuantity = data.outputQuantity;
    if (data.outputSellingPrice !== undefined)
      updateData.outputSellingPrice = data.outputSellingPrice || null;
    if (data.laborCost !== undefined)
      updateData.laborCost = toTwoDecimals(data.laborCost);
    if (data.overheadCost !== undefined)
      updateData.overheadCost = toTwoDecimals(data.overheadCost);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes || null;

    updateData.outputImage = imageUrl;

    // Recalculate costs if labor/overhead changed
    if (data.laborCost !== undefined || data.overheadCost !== undefined) {
      const laborCost = data.laborCost ?? existingProduction.laborCost;
      const overheadCost = data.overheadCost ?? existingProduction.overheadCost;
      const outputQuantity =
        data.outputQuantity ?? existingProduction.outputQuantity;

      const totalCost =
        existingProduction.materialsCost + laborCost + overheadCost;
      const unitCost = outputQuantity > 0 ? totalCost / outputQuantity : 0;

      updateData.totalCost = toTwoDecimals(totalCost);
      updateData.unitCost = toTwoDecimals(unitCost);
    }

    // Update production
    const updatedProduction = await prisma.production.update({
      where: { id },
      data: updateData,
      include: {
        recipe: true,
        outputInventory: true,
        inputs: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Production updated successfully',
        success: true,
        production: updatedProduction,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update production error:', error);

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

// DELETE /api/productions/[id] - Delete production
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if production exists and belongs to user
    const existingProduction = await prisma.production.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        inputs: true,
      },
    });

    if (!existingProduction) {
      return NextResponse.json(
        { message: 'Production not found' },
        { status: 404 }
      );
    }

    // Don't allow deleting COMPLETED productions (inventory already adjusted)
    if (existingProduction.status === 'COMPLETED') {
      return NextResponse.json(
        {
          message:
            'Cannot delete completed production. Inventory has already been adjusted. Please create a stock adjustment to reverse if needed.',
        },
        { status: 400 }
      );
    }

    // Delete image if exists
    if (existingProduction.outputImage) {
      try {
        await deleteImage(existingProduction.outputImage);
      } catch (error) {
        console.error('Failed to delete image:', error);
      }
    }

    // Delete production (inputs will be cascade deleted)
    await prisma.production.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        message: 'Production deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete production error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
