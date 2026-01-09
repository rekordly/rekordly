// app/api/recipes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import {
  UpdateRecipeSchema,
  type RecipeIngredientInput, // Import the inferred type
} from '@/lib/validations/production';
import { deleteImage, uploadInventoryImage } from '@/lib/cloudinary';

// GET /api/recipes/[id] - Get single template with full details
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const recipe = await prisma.productRecipe.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        outputInventory: true,
        ingredients: {
          include: {
            inventoryItem: true,
          },
          orderBy: {
            inventoryItem: {
              name: 'asc',
            },
          },
        },
        productions: {
          orderBy: {
            productionDate: 'desc',
          },
          take: 5,
          include: {
            outputInventory: true,
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

    // Calculate costs
    const totalMaterialCost = recipe.ingredients.reduce((sum, ing) => {
      return sum + ing.quantity * ing.inventoryItem.averageCost;
    }, 0);

    const totalCostPerBatch =
      totalMaterialCost + recipe.defaultLaborCost + recipe.defaultOverheadCost;
    const unitCost =
      recipe.outputQuantity > 0 ? totalCostPerBatch / recipe.outputQuantity : 0;

    return NextResponse.json(
      {
        success: true,
        recipe: {
          ...recipe,
          totalMaterialCost,
          totalCostPerBatch,
          unitCost,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get template error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/recipes/[id] - Update product template
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if template exists and belongs to user
    const existingRecipe = await prisma.productRecipe.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        ingredients: true,
      },
    });

    if (!existingRecipe) {
      return NextResponse.json(
        { message: 'Product template not found' },
        { status: 404 }
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
      data = UpdateRecipeSchema.parse(parsedData);
    }

    // Validate output product if being changed
    if (
      data.outputInventoryItemId &&
      data.outputInventoryItemId !== existingRecipe.outputInventoryItemId
    ) {
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

      // Check if another template exists for this product
      const otherTemplate = await prisma.productRecipe.findFirst({
        where: {
          outputInventoryItemId: data.outputInventoryItemId,
          userId,
          id: { not: id },
        },
      });

      if (otherTemplate) {
        return NextResponse.json(
          { message: 'A template already exists for this product' },
          { status: 400 }
        );
      }
    }

    // Validate all ingredients if being updated
    if (data.ingredients) {
      // Type 'ing' explicitly here using the imported type
      for (const ing of data.ingredients) {
        const material = await prisma.inventoryItem.findFirst({
          where: {
            id: ing.inventoryItemId,
            userId,
          },
        });

        if (!material) {
          return NextResponse.json(
            { message: `Material not found: ${ing.inventoryItemId}` },
            { status: 404 }
          );
        }

        if (!['RAW_MATERIAL', 'CONSUMABLE'].includes(material.itemType)) {
          return NextResponse.json(
            {
              message: `${material.name} is not a valid material type. Only RAW_MATERIAL and CONSUMABLE can be used.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // Handle image upload/removal
    let imageUrl: string | null = existingRecipe.recipeImage;

    if (file) {
      try {
        const uploadResult = await uploadInventoryImage(
          file,
          userId,
          existingRecipe.recipeImage
        );
        imageUrl = uploadResult.url;
      } catch (error: any) {
        return NextResponse.json(
          { message: error.message || 'Failed to upload image' },
          { status: 400 }
        );
      }
    } else if (removeImage && existingRecipe.recipeImage) {
      try {
        await deleteImage(existingRecipe.recipeImage);
        imageUrl = null;
      } catch (error: any) {
        console.error('Failed to delete image:', error);
      }
    }

    // Update template in a transaction
    const updatedRecipe = await prisma.$transaction(async tx => {
      // Build update data
      const updateData: any = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined)
        updateData.description = data.description || null;
      if (data.category !== undefined)
        updateData.category = data.category || null;
      if (data.outputInventoryItemId !== undefined)
        updateData.outputInventoryItemId = data.outputInventoryItemId;
      if (data.outputQuantity !== undefined)
        updateData.outputQuantity = data.outputQuantity;
      if (data.defaultLaborCost !== undefined)
        updateData.defaultLaborCost = data.defaultLaborCost;
      if (data.defaultOverheadCost !== undefined)
        updateData.defaultOverheadCost = data.defaultOverheadCost;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      updateData.recipeImage = imageUrl;

      // Update recipe
      const recipe = await tx.productRecipe.update({
        where: { id },
        data: updateData,
      });

      // Update ingredients if provided
      if (data.ingredients) {
        // Delete existing ingredients
        await tx.recipeIngredient.deleteMany({
          where: { recipeId: id },
        });

        // Create new ingredients
        // Type 'ing' explicitly here
        await tx.recipeIngredient.createMany({
          data: data.ingredients.map((ing: RecipeIngredientInput) => ({
            recipeId: id,
            inventoryItemId: ing.inventoryItemId,
            quantity: ing.quantity,
            notes: ing.notes || null,
          })),
        });
      }

      // Return updated recipe with relations
      return tx.productRecipe.findUnique({
        where: { id },
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
        message: 'Product template updated successfully',
        success: true,
        recipe: updatedRecipe,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update template error:', error);

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

// DELETE /api/recipes/[id] - Delete product template
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if template exists and belongs to user
    const existingRecipe = await prisma.productRecipe.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        productions: true,
      },
    });

    if (!existingRecipe) {
      return NextResponse.json(
        { message: 'Product template not found' },
        { status: 404 }
      );
    }

    // Check if template has been used in productions
    if (existingRecipe.productions.length > 0) {
      return NextResponse.json(
        {
          message: `Cannot delete template. It has been used in ${existingRecipe.productions.length} production(s). You can deactivate it instead.`,
          productionCount: existingRecipe.productions.length,
        },
        { status: 400 }
      );
    }

    // Delete image if exists
    if (existingRecipe.recipeImage) {
      try {
        await deleteImage(existingRecipe.recipeImage);
      } catch (error) {
        console.error('Failed to delete image:', error);
      }
    }

    // Delete template (ingredients will be cascade deleted)
    await prisma.productRecipe.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        message: 'Product template deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete template error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
