// app/api/recipes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import {
  CreateRecipeSchema,
  RecipeFiltersSchema,
} from '@/lib/validations/production';
import { uploadInventoryImage } from '@/lib/cloudinary';

// POST /api/recipes - Create new product template
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
        { message: 'Missing template data' },
        { status: 400 }
      );
    }

    const data = CreateRecipeSchema.parse(JSON.parse(jsonData));

    console.log('Creating product template:', JSON.stringify(data, null, 2));

    // Check if output product exists and belongs to user
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

    // Check if output product already has a template
    const existingTemplate = await prisma.productRecipe.findFirst({
      where: {
        outputInventoryItemId: data.outputInventoryItemId,
        userId,
      },
    });

    if (existingTemplate) {
      return NextResponse.json(
        { message: 'A template already exists for this product' },
        { status: 400 }
      );
    }

    // Validate all ingredients exist and belong to user
    for (const ingredient of data.ingredients) {
      const material = await prisma.inventoryItem.findFirst({
        where: {
          id: ingredient.inventoryItemId,
          userId,
        },
      });

      if (!material) {
        return NextResponse.json(
          { message: `Material not found: ${ingredient.inventoryItemId}` },
          { status: 404 }
        );
      }

      // Check if material is RAW_MATERIAL or CONSUMABLE
      if (!['RAW_MATERIAL', 'CONSUMABLE'].includes(material.itemType)) {
        return NextResponse.json(
          {
            message: `${material.name} is not a valid material type. Only RAW_MATERIAL and CONSUMABLE can be used.`,
          },
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

    // Create template with ingredients in a transaction
    const recipe = await prisma.$transaction(async tx => {
      // Create recipe
      const newRecipe = await tx.productRecipe.create({
        data: {
          userId,
          name: data.name,
          description: data.description || null,
          category: data.category || null,
          outputInventoryItemId: data.outputInventoryItemId,
          outputQuantity: data.outputQuantity,
          defaultLaborCost: data.defaultLaborCost,
          defaultOverheadCost: data.defaultOverheadCost,
          recipeImage: imageUrl,
          isActive: data.isActive,
        },
      });

      // Create ingredients
      await tx.recipeIngredient.createMany({
        data: data.ingredients.map(ing => ({
          recipeId: newRecipe.id,
          inventoryItemId: ing.inventoryItemId,
          quantity: ing.quantity,
          notes: ing.notes || null,
        })),
      });

      // Fetch complete recipe with relations
      return tx.productRecipe.findUnique({
        where: { id: newRecipe.id },
        include: {
          outputInventory: true,
          ingredients: {
            include: {
              inventoryItem: true,
            },
          },
        },
      });
    });

    return NextResponse.json(
      {
        message: 'Product template created successfully',
        success: true,
        recipe,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create template error:', error);

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

// GET /api/recipes - List all product templates
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const filters = RecipeFiltersSchema.parse({
      category: searchParams.get('category') || undefined,
      isActive:
        searchParams.get('isActive') === 'true'
          ? true
          : searchParams.get('isActive') === 'false'
            ? false
            : undefined,
      outputInventoryItemId:
        searchParams.get('outputInventoryItemId') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '50'),
    });

    const where: any = { userId };

    // Apply filters
    if (filters.category) {
      where.category = {
        contains: filters.category,
        mode: 'insensitive',
      };
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.outputInventoryItemId) {
      where.outputInventoryItemId = filters.outputInventoryItemId;
    }

    // Calculate pagination
    const skip = (filters.page - 1) * filters.limit;

    // Fetch templates and total count in parallel
    const [recipes, total] = await Promise.all([
      prisma.productRecipe.findMany({
        where,
        include: {
          outputInventory: true,
          ingredients: {
            include: {
              inventoryItem: true,
            },
          },
        },
        orderBy: [{ name: 'asc' }],
        skip,
        take: filters.limit,
      }),
      prisma.productRecipe.count({ where }),
    ]);

    // Calculate costs for each recipe
    const recipesWithCosts = recipes.map(recipe => {
      const totalMaterialCost = recipe.ingredients.reduce((sum, ing) => {
        return sum + ing.quantity * ing.inventoryItem.averageCost;
      }, 0);

      const totalCostPerBatch =
        totalMaterialCost +
        recipe.defaultLaborCost +
        recipe.defaultOverheadCost;
      const unitCost =
        recipe.outputQuantity > 0
          ? totalCostPerBatch / recipe.outputQuantity
          : 0;

      return {
        ...recipe,
        totalMaterialCost,
        totalCostPerBatch,
        unitCost,
      };
    });

    return NextResponse.json(
      {
        success: true,
        recipes: recipesWithCosts,
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
    console.error('Get templates error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
