// app/api/inventory-items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import {
  CreateInventoryItemSchema,
  InventoryFiltersSchema,
} from '@/lib/validations/inventory';
import { toTwoDecimals } from '@/lib/fn';
import { generateSKU } from '@/lib/handlers/purchase-handlers';
import { uploadInventoryImage } from '@/lib/cloudinary';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // Extract JSON data
    const jsonData = formData.get('data') as string;
    if (!jsonData) {
      return NextResponse.json(
        { message: 'Missing inventory item data' },
        { status: 400 }
      );
    }

    const data = CreateInventoryItemSchema.parse(JSON.parse(jsonData));

    console.log(
      'Creating inventory item with data:',
      JSON.stringify(data, null, 2)
    );

    // Check if SKU is unique for this user
    if (data.sku && data.sku.trim() !== '') {
      const existingSku = await prisma.inventoryItem.findFirst({
        where: {
          userId,
          sku: data.sku.trim(),
        },
      });

      if (existingSku) {
        return NextResponse.json(
          { message: 'SKU already exists for your inventory items' },
          { status: 400 }
        );
      }
    }

    // Upload image if provided
    let imageUrl: string | null = null;
    if (file) {
      try {
        const uploadResult = await uploadInventoryImage(file, userId);
        imageUrl = uploadResult.url;
      } catch (error: any) {
        return NextResponse.json(
          { message: error.message || 'Failed to upload image' },
          { status: 400 }
        );
      }
    }

    // Create inventory item
    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        userId,
        itemType: data.itemType,
        name: data.name,
        description: data.description || null,
        category: data.category || null,
        sku:
          data.sku && data.sku.trim() !== ''
            ? data.sku.trim()
            : generateSKU(data.name),
        unit: data.unit,
        trackInventory: data.trackInventory,
        quantityOnHand: 0,
        reorderLevel:
          data.reorderLevel !== undefined
            ? toTwoDecimals(data.reorderLevel)
            : null,
        reorderQuantity:
          data.reorderQuantity !== undefined
            ? toTwoDecimals(data.reorderQuantity)
            : null,
        averageCost:
          data.averageCost !== undefined ? toTwoDecimals(data.averageCost) : 0,
        lastPurchaseCost:
          data.lastPurchaseCost !== undefined
            ? toTwoDecimals(data.lastPurchaseCost)
            : null,
        sellingPrice:
          data.sellingPrice !== undefined
            ? toTwoDecimals(data.sellingPrice)
            : null,
        showOnStorefront:
          data.itemType === 'RAW_MATERIAL' ? false : data.showOnStorefront,
        storefrontImage: imageUrl,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(
      {
        message: 'Inventory item created successfully',
        success: true,
        inventoryItem,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create inventory item error:', error);

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

// GET /api/inventory-items - List all inventory items
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const filters = InventoryFiltersSchema.parse({
      itemType: searchParams.get('itemType') || undefined,
      showOnStorefront:
        searchParams.get('showOnStorefront') === 'true' ? true : undefined,
      isActive: searchParams.get('isActive') === 'true' ? true : undefined,
      category: searchParams.get('category') || undefined,
      search: searchParams.get('search') || undefined,
      lowStock: searchParams.get('lowStock') === 'true' ? true : undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
    });

    const where: any = { userId };

    // Apply filters
    if (filters.itemType) {
      where.itemType = filters.itemType;
    }
    if (filters.showOnStorefront !== undefined) {
      where.showOnStorefront = filters.showOnStorefront;
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.category) {
      where.category = {
        contains: filters.category,
        mode: 'insensitive',
      };
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Calculate pagination
    const skip = (filters.page - 1) * filters.limit;

    // Fetch inventory items and total count in parallel
    const [inventoryItems, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        skip,
        take: filters.limit,
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    // Filter for low stock if requested
    let filteredItems = inventoryItems;
    if (filters.lowStock) {
      filteredItems = inventoryItems.filter(
        item =>
          item.trackInventory &&
          item.reorderLevel !== null &&
          item.quantityOnHand <= item.reorderLevel
      );
    }

    return NextResponse.json(
      {
        success: true,
        inventoryItems: filteredItems,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total: filters.lowStock ? filteredItems.length : total,
          totalPages: Math.ceil(
            (filters.lowStock ? filteredItems.length : total) / filters.limit
          ),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get inventory items error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
