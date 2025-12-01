import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { UpdatePurchaseSchema } from '@/lib/validations/purchases';
import { toTwoDecimals } from '@/lib/fn';

// GET /api/purchases/[id] - Get single purchase
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const purchase = await prisma.purchase.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },

        payments: {
          select: {
            id: true,
            purchaseId: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
            reference: true,
            notes: true,
          },
          orderBy: {
            paymentDate: 'desc',
          },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { message: 'Purchase not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        purchase,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get purchase error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/purchases/[id] - Update purchase
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const body = await request.json();
    const validationResult = UpdatePurchaseSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Check if purchase exists and belongs to user
    const existingPurchase = await prisma.purchase.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { message: 'Purchase not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    // Only include fields that are provided in the update
    if (data.customer?.name !== undefined)
      updateData.vendorName = data.customer?.name;
    if (data.customer?.email !== undefined)
      updateData.vendorEmail = data.customer?.email;
    if (data.customer?.phone !== undefined)
      updateData.vendorPhone = data.customer?.phone;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.items !== undefined) {
      updateData.items = data.items.map((item: any) => ({
        ...item,
        unitPrice: toTwoDecimals(item.unitPrice),
        total: toTwoDecimals(item.total),
      }));
    }
    if (data.subtotal !== undefined)
      updateData.subtotal = toTwoDecimals(data.subtotal);
    if (data.otherCosts !== undefined) {
      updateData.otherCosts = data.otherCosts.map((cost: any) => ({
        ...cost,
        amount: toTwoDecimals(cost.amount),
      }));
    }
    if (data.otherCostsTotal !== undefined)
      updateData.otherCostsTotal = toTwoDecimals(data.otherCostsTotal);
    if (data.includeVAT !== undefined) updateData.includeVAT = data.includeVAT;
    if (data.vatAmount !== undefined)
      updateData.vatAmount = toTwoDecimals(data.vatAmount || 0);
    if (data.totalAmount !== undefined)
      updateData.totalAmount = toTwoDecimals(data.totalAmount);
    if (data.amountPaid !== undefined)
      updateData.amountPaid = toTwoDecimals(data.amountPaid);
    if (data.balance !== undefined)
      updateData.balance = toTwoDecimals(data.balance);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.purchaseDate !== undefined)
      updateData.purchaseDate = new Date(data.purchaseDate);

    // Update purchase
    const updatedPurchase = await prisma.purchase.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        payments: {
          select: {
            id: true,
            purchaseId: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
            reference: true,
            notes: true,
          },
          orderBy: {
            paymentDate: 'desc',
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Purchase updated successfully',
        success: true,
        purchase: updatedPurchase,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update purchase error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Validation error', errors: error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/purchases/[id] - Delete purchase
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if purchase exists and belongs to user
    const existingPurchase = await prisma.purchase.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        payments: true,
      },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { message: 'Purchase not found' },
        { status: 404 }
      );
    }

    // Delete purchase and related records in a transaction
    await prisma.$transaction(async tx => {
      // Delete related payments
      await tx.payment.deleteMany({
        where: { purchaseId: id },
      });

      // Delete the purchase
      await tx.purchase.delete({
        where: { id },
      });
    });

    return NextResponse.json(
      {
        message: 'Purchase deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete purchase error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
