import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { BatchCalculationSchema } from '@/lib/validations/production';
import { toTwoDecimals } from '@/lib/fn';

// POST /api/productions/calculate-costs - Calculate production costs
export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);
    const body = await request.json();
    const data = BatchCalculationSchema.parse(body);

    // Get recipe with ingredients
    const recipe = await prisma.productRecipe.findFirst({
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
        outputInventory: true,
      },
    });

    if (!recipe) {
      return NextResponse.json(
        { message: 'Product template not found' },
        { status: 404 }
      );
    }

    const batchMultiplier = data.batchMultiplier || 1;

    // Calculate material costs with adjustments
    const materials = recipe.ingredients.map(ing => {
      // Check if there's an adjustment for this ingredient
      const adjustment = data.adjustments?.find(
        adj => adj.ingredientId === ing.id
      );

      const quantity = adjustment
        ? adjustment.newQuantity
        : ing.quantity * batchMultiplier;
      const unitCost = ing.inventoryItem.averageCost;
      const totalCost = quantity * unitCost;

      return {
        inventoryItemId: ing.inventoryItemId,
        inventoryItem: ing.inventoryItem,
        quantity,
        unitCost: toTwoDecimals(unitCost),
        totalCost: toTwoDecimals(totalCost),
      };
    });

    const materialsCost = materials.reduce((sum, m) => sum + m.totalCost, 0);
    const outputQuantity = recipe.outputQuantity * batchMultiplier;

    // Calculate suggested labor and overhead (can be adjusted by user)
    const suggestedLaborCost = recipe.defaultLaborCost * batchMultiplier;
    const suggestedOverheadCost = recipe.defaultOverheadCost * batchMultiplier;

    const totalCost =
      materialsCost + suggestedLaborCost + suggestedOverheadCost;
    const unitCost = outputQuantity > 0 ? totalCost / outputQuantity : 0;

    return NextResponse.json(
      {
        success: true,
        calculation: {
          recipeId: recipe.id,
          recipeName: recipe.name,
          batchMultiplier,
          outputQuantity,
          materials,
          materialsCost: toTwoDecimals(materialsCost),
          suggestedLaborCost: toTwoDecimals(suggestedLaborCost),
          suggestedOverheadCost: toTwoDecimals(suggestedOverheadCost),
          totalCost: toTwoDecimals(totalCost),
          unitCost: toTwoDecimals(unitCost),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Calculate costs error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
