import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { validateRequest } from '@/lib/utils/validation';
import { RefundSchema } from '@/lib/validations/general';
import { toTwoDecimals } from '@/lib/fn';
import { PaymentMethod, StatusType } from '@/types/index';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);
    const purchaseId = id;

    // Check if purchase exists and belongs to user
    const existingPurchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, userId },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { message: 'Purchase not found or unauthorized' },
        { status: 404 }
      );
    }

    const data = await validateRequest(request, RefundSchema);

    // Validate refund conditions
    if (existingPurchase.amountPaid === 0) {
      return NextResponse.json(
        { message: 'Cannot refund a purchase with no payments' },
        { status: 400 }
      );
    }

    const refundAmount = toTwoDecimals(data.refundAmount);

    // Validate refund amount doesn't exceed amount paid
    if (refundAmount > existingPurchase.amountPaid) {
      return NextResponse.json(
        { message: 'Refund amount cannot exceed amount paid' },
        { status: 400 }
      );
    }

    // Check if adding this refund would exceed total paid
    const existingRefundAmount = existingPurchase.refundAmount || 0;
    const totalRefundAmount = toTwoDecimals(
      existingRefundAmount + refundAmount
    );

    if (totalRefundAmount > existingPurchase.amountPaid) {
      return NextResponse.json(
        { message: 'Total refund amount cannot exceed amount paid' },
        { status: 400 }
      );
    }

    let status: StatusType;

    if (totalRefundAmount === existingPurchase.amountPaid) {
      status = 'REFUNDED';
    } else {
      status = 'PARTIALLY_REFUNDED';
    }

    const refundDate = data.refundDate ? new Date(data.refundDate) : new Date();

    const result = await prisma.$transaction(
      async tx => {
        const refundPayment = await tx.payment.create({
          data: {
            userId,
            payableType: 'PURCHASE',
            purchaseId: purchaseId,
            amount: refundAmount,
            paymentDate: refundDate,
            paymentMethod: (data.paymentMethod ||
              'BANK_TRANSFER') as PaymentMethod,
            category: 'INCOME',
            reference: data.reference || null,
            notes: data.refundReason
              ? `Refund for purchase ${existingPurchase.purchaseNumber}: ${data.refundReason}`
              : `Refund for purchase ${existingPurchase.purchaseNumber}`,
          },
        });

        const updatedPurchase = await tx.purchase.update({
          where: { id: purchaseId },
          data: {
            amountPaid: existingPurchase.amountPaid - refundAmount,
            refundAmount: totalRefundAmount,
            refundReason: data.refundReason,
            refundDate,
            status,
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

        return { purchase: updatedPurchase, payment: refundPayment };
      },
      {
        maxWait: 10000,
        timeout: 10000,
      }
    );

    return NextResponse.json(
      {
        message: 'Refund processed successfully',
        success: true,
        purchase: result.purchase,
        payment: result.payment,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Purchase refund error:', error);

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
