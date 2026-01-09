import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { StockAdjustmentSchema } from '@/lib/validations/inventory';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';

// POST /api/inventory-items/[id]/adjust - Create manual stock adjustment
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if inventory item exists and belongs to user
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!inventoryItem) {
      return NextResponse.json(
        { message: 'Inventory item not found' },
        { status: 404 }
      );
    }

    if (!inventoryItem.trackInventory) {
      return NextResponse.json(
        {
          message: 'Cannot adjust stock for items that do not track inventory',
        },
        { status: 400 }
      );
    }

    const data = await validateRequest(request, StockAdjustmentSchema);

    // Calculate new quantity
    const oldQuantity = inventoryItem.quantityOnHand;
    let newQuantity = oldQuantity;

    // Determine adjustment based on type
    const adjustmentTypes = ['DAMAGE', 'THEFT', 'EXPIRED', 'USED'];
    if (adjustmentTypes.includes(data.adjustmentType)) {
      // These decrease stock
      newQuantity = toTwoDecimals(oldQuantity - data.quantity);

      if (newQuantity < 0) {
        return NextResponse.json(
          {
            message: `Adjustment would result in negative stock. Current: ${oldQuantity}, Adjusting: ${data.quantity}`,
          },
          { status: 400 }
        );
      }
    } else {
      // FOUND, CORRECTION, OTHER - these can increase or decrease
      const sign =
        data.adjustmentType === 'CORRECTION'
          ? data.reason.toLowerCase().includes('add')
            ? 1
            : -1
          : 1;

      newQuantity = toTwoDecimals(oldQuantity + data.quantity * sign);
    }

    // Calculate cost impact (optional, use averageCost)
    const unitCost = inventoryItem.averageCost || 0;
    const totalCost =
      unitCost !== 0 ? toTwoDecimals(unitCost * Math.abs(data.quantity)) : null;
    const adjustmentCost =
      unitCost !== 0 && adjustmentTypes.includes(data.adjustmentType)
        ? -(totalCost || 0) // Loss (negative impact)
        : totalCost; // Gain (positive impact)

    // Create stock adjustment record
    const stockAdjustment = await prisma.stockAdjustment.create({
      data: {
        userId,
        inventoryItemId: id,
        adjustmentType: data.adjustmentType,
        quantity: data.quantity,
        reason: data.reason,
        oldQuantity,
        newQuantity,
        unitCost: unitCost !== 0 ? toTwoDecimals(unitCost) : null,
        totalCost: adjustmentCost,
        notes: data.notes || null,
        adjustmentDate: new Date(),
      },
    });

    // Update inventory item quantity
    const updatedInventoryItem = await prisma.inventoryItem.update({
      where: { id },
      data: {
        quantityOnHand: newQuantity,
      },
    });

    return NextResponse.json(
      {
        message: 'Stock adjustment created successfully',
        success: true,
        stockAdjustment,
        inventoryItem: updatedInventoryItem,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create stock adjustment error:', error);

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

// GET /api/inventory-items/[id]/adjustments - Get stock adjustment history
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if inventory item exists and belongs to user
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!inventoryItem) {
      return NextResponse.json(
        { message: 'Inventory item not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Fetch stock adjustments
    const [stockAdjustments, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        where: {
          inventoryItemId: id,
        },
        orderBy: {
          adjustmentDate: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.stockAdjustment.count({
        where: {
          inventoryItemId: id,
        },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        stockAdjustments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get stock adjustments error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
