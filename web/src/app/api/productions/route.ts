// app/api/productions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import {
  CreateProductionSchema,
  ProductionFiltersSchema,
} from '@/lib/validations/production';
import { uploadInventoryImage } from '@/lib/cloudinary';

import { generateProductionNumber, toTwoDecimals } from '@/lib/fn';

// POST /api/productions - Create new production
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
        { message: 'Missing production data' },
        { status: 400 }
      );
    }

    const data = CreateProductionSchema.parse(JSON.parse(jsonData));

    console.log('Creating production:', JSON.stringify(data, null, 2));

    // Validate output product exists and belongs to user
    const outputProduct = await prisma.inventoryItem.findFirst({
      where: {
        id: data.outputInventoryItemId,
        userId,
      },
    });

    if (!outputProduct) {
      return NextResponse.json(
        { message: 'Output product not found' },
        { status: 404 }
      );
    }

    const productionImageUrl = outputProduct.storefrontImage || null;

    // Validate template if provided
    let recipe = null;
    if (data.recipeId) {
      recipe = await prisma.productRecipe.findFirst({
        where: {
          id: data.recipeId,
          userId,
        },
        include: {
          ingredients: {
            include: {
              inventoryItem: true,
            },
          },
        },
      });

      if (!recipe) {
        return NextResponse.json(
          { message: 'Product template not found' },
          { status: 404 }
        );
      }
    }

    // Validate all input materials exist and have sufficient stock
    const insufficientMaterials: string[] = [];
    for (const input of data.inputs) {
      const material = await prisma.inventoryItem.findFirst({
        where: {
          id: input.inventoryItemId,
          userId,
        },
      });

      if (!material) {
        return NextResponse.json(
          { message: `Material not found: ${input.inventoryItemId}` },
          { status: 404 }
        );
      }

      // Check stock availability
      if (material.trackInventory && material.quantityOnHand < input.quantity) {
        insufficientMaterials.push(
          `${material.name} (Available: ${material.quantityOnHand}, Required: ${input.quantity})`
        );
      }
    }

    // If status is COMPLETED, require sufficient materials
    if (data.status === 'COMPLETED' && insufficientMaterials.length > 0) {
      return NextResponse.json(
        {
          message: 'Insufficient stock for production',
          insufficientMaterials,
        },
        { status: 400 }
      );
    }

    // Calculate costs
    const materialsCost = data.inputs.reduce(
      (sum, input) => sum + input.totalCost,
      0
    );
    const totalCost = materialsCost + data.laborCost + data.overheadCost;
    const unitCost =
      data.outputQuantity > 0 ? totalCost / data.outputQuantity : 0;

    // Generate production number
    const productionNumber = generateProductionNumber(userId);

    // Create production in a transaction
    const production = await prisma.$transaction(async tx => {
      // Create production
      const newProduction = await tx.production.create({
        data: {
          userId,
          productionNumber,
          recipeId: data.recipeId || null,
          saleId: data.saleId || null,
          title: data.title || null,
          description: data.description || null,
          productionDate: new Date(data.productionDate),
          outputItemName: data.outputItemName,
          outputQuantity: data.outputQuantity,
          outputSellingPrice: data.outputSellingPrice || null,
          outputInventoryItemId: data.outputInventoryItemId,
          outputImage: productionImageUrl,
          batchMultiplier: data.batchMultiplier || 1,
          materialsCost: toTwoDecimals(materialsCost),
          laborCost: toTwoDecimals(data.laborCost),
          overheadCost: toTwoDecimals(data.overheadCost),
          totalCost: toTwoDecimals(totalCost),
          unitCost: toTwoDecimals(unitCost),
          status: data.status,
          notes: data.notes || null,
        },
      });

      // Create production inputs
      await tx.productionInput.createMany({
        data: data.inputs.map(input => ({
          productionId: newProduction.id,
          inventoryItemId: input.inventoryItemId,
          quantity: input.quantity,
          unitCost: toTwoDecimals(input.unitCost),
          totalCost: toTwoDecimals(input.totalCost),
          notes: input.notes || null,
        })),
      });

      // If status is COMPLETED, deduct materials and add output
      if (data.status === 'COMPLETED') {
        // Deduct materials from inventory
        for (const input of data.inputs) {
          const material = await tx.inventoryItem.findUnique({
            where: { id: input.inventoryItemId },
          });

          if (!material) continue;

          if (material.trackInventory) {
            const oldQuantity = material.quantityOnHand;
            const newQuantity = oldQuantity - input.quantity;

            // Update material quantity
            await tx.inventoryItem.update({
              where: { id: input.inventoryItemId },
              data: {
                quantityOnHand: newQuantity,
              },
            });

            // Create stock adjustment
            await tx.stockAdjustment.create({
              data: {
                userId,
                inventoryItemId: input.inventoryItemId,
                adjustmentType: 'PRODUCTION',
                quantity: -input.quantity,
                reason: `Used in production: ${productionNumber}`,
                oldQuantity,
                newQuantity,
                unitCost: toTwoDecimals(input.unitCost),
                totalCost: toTwoDecimals(input.totalCost),
                sourceProductionId: newProduction.id,
                adjustmentDate: new Date(data.productionDate),
                notes: data.notes || null,
              },
            });
          }
        }

        // Add finished product to inventory
        const oldOutputQuantity = outputProduct.quantityOnHand;
        const newOutputQuantity = oldOutputQuantity + data.outputQuantity;

        // Calculate new average cost
        const oldTotalValue = oldOutputQuantity * outputProduct.averageCost;
        const newTotalValue = oldTotalValue + totalCost;
        const newAverageCost =
          newOutputQuantity > 0 ? newTotalValue / newOutputQuantity : unitCost;

        await tx.inventoryItem.update({
          where: { id: data.outputInventoryItemId },
          data: {
            quantityOnHand: newOutputQuantity,
            averageCost: toTwoDecimals(newAverageCost),
            lastPurchaseCost: toTwoDecimals(unitCost), // Store production cost as last purchase
          },
        });

        // Create stock adjustment for output
        await tx.stockAdjustment.create({
          data: {
            userId,
            inventoryItemId: data.outputInventoryItemId,
            adjustmentType: 'PRODUCTION',
            quantity: data.outputQuantity,
            reason: `Produced from: ${productionNumber}`,
            oldQuantity: oldOutputQuantity,
            newQuantity: newOutputQuantity,
            unitCost: toTwoDecimals(unitCost),
            totalCost: toTwoDecimals(totalCost),
            sourceProductionId: newProduction.id,
            adjustmentDate: new Date(data.productionDate),
            notes: data.notes || null,
          },
        });
      }

      // Fetch complete production with relations
      return tx.production.findUnique({
        where: { id: newProduction.id },
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
    });

    return NextResponse.json(
      {
        message: 'Production created successfully',
        success: true,
        production,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create production error:', error);

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

// GET /api/productions - List all productions
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const filters = ProductionFiltersSchema.parse({
      status: searchParams.get('status') || undefined,
      saleId: searchParams.get('saleId') || undefined,
      startDate: searchParams.get('startDate')
        ? new Date(searchParams.get('startDate')!)
        : undefined,
      endDate: searchParams.get('endDate')
        ? new Date(searchParams.get('endDate')!)
        : undefined,
      recipeId: searchParams.get('recipeId') || undefined,
      outputInventoryItemId:
        searchParams.get('outputInventoryItemId') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '50'),
    });

    const where: any = { userId };

    // Apply filters
    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters.saleId) {
      where.saleId = filters.saleId;
    }
    if (filters.recipeId) {
      where.recipeId = filters.recipeId;
    }
    if (filters.outputInventoryItemId) {
      where.outputInventoryItemId = filters.outputInventoryItemId;
    }
    if (filters.startDate || filters.endDate) {
      where.productionDate = {};
      if (filters.startDate) {
        where.productionDate.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.productionDate.lte = filters.endDate;
      }
    }

    // Calculate pagination
    const skip = (filters.page - 1) * filters.limit;

    // Fetch productions and total count in parallel
    const [productions, total] = await Promise.all([
      prisma.production.findMany({
        where,
        include: {
          recipe: true,
          outputInventory: true,
          inputs: {
            include: {
              inventoryItem: true,
            },
          },
        },
        orderBy: [{ productionDate: 'desc' }],
        skip,
        take: filters.limit,
      }),
      prisma.production.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        productions,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          totalPages: Math.ceil(total / filters.limit),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get productions error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
