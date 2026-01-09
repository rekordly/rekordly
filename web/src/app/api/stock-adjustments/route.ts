import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';

// POST /api/stock-adjustments - Create stock adjustment (general endpoint)
// Note: For adjusting specific items, use /api/inventory-items/[id]/adjust
// This endpoint creates adjustments and handles quantity updates
export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const body = await request.json();
    const { inventoryItemId, adjustmentType, quantity, reason, notes } = body;

    if (!inventoryItemId) {
      return NextResponse.json(
        { message: 'Inventory item ID is required' },
        { status: 400 }
      );
    }

    if (!adjustmentType || !quantity || !reason) {
      return NextResponse.json(
        { message: 'Adjustment type, quantity, and reason are required' },
        { status: 400 }
      );
    }

    // Check if inventory item exists and belongs to user
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: {
        id: inventoryItemId,
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

    const result = await prisma.$transaction(async tx => {
      // Calculate new quantity
      const oldQuantity = inventoryItem.quantityOnHand;
      let newQuantity = oldQuantity;

      // Determine adjustment based on type
      const decreaseTypes = ['DAMAGE', 'THEFT', 'EXPIRED', 'USED'];
      if (decreaseTypes.includes(adjustmentType)) {
        // These decrease stock
        newQuantity = Math.max(0, oldQuantity - quantity);
      } else {
        // FOUND, CORRECTION, OTHER - these can increase or decrease
        // Check if it's a correction (decrease) or gain (increase)
        const isDecrease =
          adjustmentType === 'CORRECTION' &&
          (reason.toLowerCase().includes('subtract') ||
            reason.toLowerCase().includes('remove') ||
            reason.toLowerCase().includes('decrease'));

        newQuantity = isDecrease
          ? Math.max(0, oldQuantity - quantity)
          : oldQuantity + quantity;
      }

      // Calculate cost impact
      const unitCost = inventoryItem.averageCost || 0;
      const totalCost = unitCost !== 0 ? unitCost * Math.abs(quantity) : 0;
      const adjustmentCost =
        decreaseTypes.includes(adjustmentType) ||
        (adjustmentType === 'CORRECTION' && newQuantity < oldQuantity)
          ? -totalCost // Loss (negative impact)
          : totalCost; // Gain (positive impact)

      // Create stock adjustment record
      const stockAdjustment = await tx.stockAdjustment.create({
        data: {
          userId,
          inventoryItemId,
          adjustmentType,
          quantity,
          reason,
          oldQuantity,
          newQuantity,
          unitCost: unitCost !== 0 ? unitCost : null,
          totalCost: unitCost !== 0 ? adjustmentCost : null,
          notes: notes || null,
          adjustmentDate: new Date(),
        },
      });

      // Update inventory item quantity
      const updatedInventoryItem = await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: {
          quantityOnHand: newQuantity,
        },
      });

      return { stockAdjustment, inventoryItem: updatedInventoryItem };
    });

    return NextResponse.json(
      {
        message: 'Stock adjustment created successfully',
        success: true,
        ...result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create stock adjustment error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/stock-adjustments - List all stock adjustments
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const inventoryItemId = searchParams.get('inventoryItemId');
    const adjustmentType = searchParams.get('adjustmentType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const where: any = { userId };

    // Apply filters
    if (inventoryItemId) {
      where.inventoryItemId = inventoryItemId;
    }
    if (adjustmentType) {
      where.adjustmentType = adjustmentType;
    }
    if (startDate || endDate) {
      where.adjustmentDate = {};
      if (startDate) where.adjustmentDate.gte = new Date(startDate);
      if (endDate) where.adjustmentDate.lte = new Date(endDate);
    }

    // Fetch stock adjustments and total count in parallel
    const [stockAdjustments, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        where,
        include: {
          inventoryItem: {
            select: {
              id: true,
              name: true,
              sku: true,
              itemType: true,
              unit: true,
            },
          },
        },
        orderBy: {
          adjustmentDate: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.stockAdjustment.count({ where }),
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
