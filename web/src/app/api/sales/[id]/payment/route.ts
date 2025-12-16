// app/api/sales/[id]/payment/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { addPaymentSchema } from '@/lib/validations/general';
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
    const validationResult = addPaymentSchema.safeParse(body);

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

    if (!existingSale) {
      return NextResponse.json(
        { message: 'Sale not found or unauthorized' },
        { status: 404 }
      );
    }

    if (
      existingSale.status === 'REFUNDED' ||
      existingSale.status === 'PARTIALLY_REFUNDED'
    ) {
      return NextResponse.json(
        { message: 'Cannot add payment to a refunded sale' },
        { status: 400 }
      );
    }

    // Check if sale is already fully paid
    const existingBalance = existingSale.balance;
    if (existingBalance === 0) {
      return NextResponse.json(
        { message: 'Sale is already fully paid' },
        { status: 400 }
      );
    }

    // Check if payment amount exceeds balance
    const paymentAmount = toTwoDecimals(data.amountPaid);
    if (paymentAmount > existingBalance) {
      return NextResponse.json(
        { message: 'Payment amount cannot exceed remaining balance' },
        { status: 400 }
      );
    }

    // Use transaction to create payment and update sale
    const result = await prisma.$transaction(async tx => {
      // Create payment record
      const payment = await tx.payment.create({
        data: {
          userId,
          payableType: 'SALE',
          saleId: existingSale.id,
          amount: paymentAmount,
          paymentDate: data.paymentDate
            ? new Date(data.paymentDate)
            : new Date(),
          paymentMethod: data.paymentMethod,
          category: 'INCOME',
          reference: data.reference || null,
          notes: data.notes || null,
        },
      });

      // Update sale
      const newAmountPaid = toTwoDecimals(
        existingSale.amountPaid + paymentAmount
      );
      const newBalance = toTwoDecimals(
        existingSale.totalAmount - newAmountPaid
      );

      // Determine new status
      let newStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' = 'UNPAID';
      if (newAmountPaid >= existingSale.totalAmount) {
        newStatus = 'PAID';
      } else if (newAmountPaid > 0) {
        newStatus = 'PARTIALLY_PAID';
      }

      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: {
          amountPaid: newAmountPaid,
          balance: newBalance,
          status: newStatus,
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
              saleId: true,
              amount: true,
              paymentDate: true,
              paymentMethod: true,
              category: true,
              payableType: true,
              reference: true,
              notes: true,
            },
            orderBy: {
              paymentDate: 'desc',
            },
          },
        },
      });

      return { sale: updatedSale, payment };
    });

    return NextResponse.json(
      {
        message: 'Payment added successfully',
        success: true,
        sale: result.sale,
        payment: result.payment,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Add payment error:', error);

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
