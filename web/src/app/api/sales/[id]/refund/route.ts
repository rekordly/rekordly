// app/api/sales/[id]/refund/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { RefundSchema } from '@/lib/validations/general';
import { toTwoDecimals } from '@/lib/fn';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);
    const saleId = id;

    // Check if sale exists and belongs to user
    const existingSale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });

    if (!existingSale) {
      return NextResponse.json(
        { message: 'Sale not found or unauthorized' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validationResult = RefundSchema.safeParse(body);

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

    // Validate refund conditions
    if (existingSale.amountPaid === 0) {
      return NextResponse.json(
        { message: 'Cannot refund a sale with no payments' },
        { status: 400 }
      );
    }

    if (existingSale.refundAmount && existingSale.refundAmount > 0) {
      return NextResponse.json(
        { message: 'This sale has already been refunded' },
        { status: 400 }
      );
    }

    // Full refund amount is the amount paid
    const refundAmount = toTwoDecimals(existingSale.amountPaid);

    // Update sale with refund information
    const updatedSale = await prisma.sale.update({
      where: { id: saleId },
      data: {
        refundAmount,
        refundReason: data.refundReason,
        refundDate: data.refundDate ? new Date(data.refundDate) : new Date(),
        status: 'REFUNDED',
        balance: toTwoDecimals(existingSale.totalAmount), // Reset balance to total
        amountPaid: 0, // Reset amount paid to 0
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
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Refund processed successfully',
        success: true,
        sale: updatedSale,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Refund error:', error);

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
