import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';

// GET /api/inventory-items/storefront - Get items for storefront display
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const itemType = searchParams.get('itemType');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Storefront filter: showOnStorefront = true AND isActive = true
    const where: any = {
      userId,
      showOnStorefront: true,
      isActive: true,
    };

    // Optional filters
    if (category) {
      where.category = {
        contains: category,
        mode: 'insensitive',
      };
    }

    if (itemType) {
      where.itemType = itemType;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Fetch storefront items and total count in parallel
    const [inventoryItems, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          sku: true,
          unit: true,
          itemType: true,
          quantityOnHand: true,
          trackInventory: true,
          reorderLevel: true,
          reorderQuantity: true,
          averageCost: true,
          sellingPrice: true,
          storefrontImage: true,
          // storefrontOrder: true,
          isActive: true,
        },
        // orderBy: [{ storefrontOrder: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        inventoryItems,
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
    console.error('Get storefront inventory error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
