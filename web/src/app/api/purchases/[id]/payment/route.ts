import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { addPaymentSchema } from '@/lib/validations/general';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const paymentData = await validateRequest(request, addPaymentSchema);

    // Check if purchase exists and belongs to user
    const purchase = await prisma.purchase.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { message: 'Purchase not found' },
        { status: 404 }
      );
    }

    if (paymentData.amountPaid <= 0) {
      return NextResponse.json(
        { message: 'Payment amount cannot be zero' },
        { status: 400 }
      );
    }
    // Validate payment amount
    const newAmountPaid = toTwoDecimals(
      purchase.amountPaid + paymentData.amountPaid
    );
    const totalAmount = toTwoDecimals(purchase.totalAmount);

    if (newAmountPaid > totalAmount) {
      return NextResponse.json(
        { message: 'Payment amount exceeds total purchase amount' },
        { status: 400 }
      );
    }

    // Determine new status
    let newStatus:
      | 'UNPAID'
      | 'PARTIALLY_PAID'
      | 'PAID'
      | 'REFUNDED'
      | 'PARTIALLY_REFUNDED' = purchase.status;
    if (newAmountPaid >= totalAmount) {
      newStatus = 'PAID';
    } else if (newAmountPaid > 0) {
      newStatus = 'PARTIALLY_PAID';
    }

    // Create payment and update purchase in a transaction
    const result = await prisma.$transaction(
      async tx => {
        // Create payment record
        const payment = await tx.payment.create({
          data: {
            userId,
            payableType: 'PURCHASE',
            purchaseId: id,
            amount: toTwoDecimals(paymentData.amountPaid),
            paymentDate: paymentData.paymentDate
              ? new Date(paymentData.paymentDate)
              : new Date(),
            paymentMethod: paymentData.paymentMethod,
            category: 'EXPENSE',
            reference: paymentData.reference || null,
            notes: paymentData.notes || null,
          },
        });

        // Update purchase
        const updatedPurchase = await tx.purchase.update({
          where: { id },
          data: {
            amountPaid: newAmountPaid,
            balance: toTwoDecimals(totalAmount - newAmountPaid),
            status: newStatus,
            updatedAt: new Date(),
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
            expense: {
              select: {
                id: true,
                category: true,
                amount: true,
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

        return { payment, purchase: updatedPurchase };
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    return NextResponse.json(
      {
        message: 'Payment recorded successfully',
        success: true,
        payment: result.payment,
        purchase: result.purchase,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Record purchase payment error:', error);

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
