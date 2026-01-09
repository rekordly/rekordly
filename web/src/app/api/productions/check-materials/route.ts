// app/api/productions/check-materials/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { MaterialAvailabilitySchema } from '@/lib/validations/production';

// POST /api/productions/check-materials - Check material availability
export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);
    const body = await request.json();
    const data = MaterialAvailabilitySchema.parse(body);

    const availability = await Promise.all(
      data.materials.map(async material => {
        const inventoryItem = await prisma.inventoryItem.findFirst({
          where: {
            id: material.inventoryItemId,
            userId,
          },
        });

        if (!inventoryItem) {
          return {
            inventoryItemId: material.inventoryItemId,
            inventoryItem: null,
            requiredQuantity: material.requiredQuantity,
            availableQuantity: 0,
            isAvailable: false,
            shortfall: material.requiredQuantity,
          };
        }

        const isAvailable =
          !inventoryItem.trackInventory ||
          inventoryItem.quantityOnHand >= material.requiredQuantity;
        const shortfall = Math.max(
          0,
          material.requiredQuantity - inventoryItem.quantityOnHand
        );

        return {
          inventoryItemId: material.inventoryItemId,
          inventoryItem,
          requiredQuantity: material.requiredQuantity,
          availableQuantity: inventoryItem.quantityOnHand,
          isAvailable,
          shortfall,
        };
      })
    );

    return NextResponse.json(
      {
        success: true,
        availability,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Check materials error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
