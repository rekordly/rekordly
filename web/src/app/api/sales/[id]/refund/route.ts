import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { RefundSchema } from '@/lib/validations/general';
import { toTwoDecimals } from '@/lib/fn';
import { PaymentMethod, StatusType } from '@/types/index';
import { validateRequest } from '@/lib/utils/validation';

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

    const data = await validateRequest(request, RefundSchema);

    // Validate refund conditions
    if (existingSale.amountPaid === 0) {
      return NextResponse.json(
        { message: 'Cannot refund a sale with no payments' },
        { status: 400 }
      );
    }

    const refundAmount = toTwoDecimals(data.refundAmount);

    // Validate refund amount doesn't exceed amount paid
    if (refundAmount > existingSale.amountPaid) {
      return NextResponse.json(
        { message: 'Refund amount cannot exceed amount paid' },
        { status: 400 }
      );
    }

    // Check if adding this refund would exceed total paid
    const existingRefundAmount = existingSale.refundAmount || 0;
    const totalRefundAmount = toTwoDecimals(
      existingRefundAmount + refundAmount
    );

    if (totalRefundAmount > existingSale.amountPaid) {
      return NextResponse.json(
        { message: 'Total refund amount cannot exceed amount paid' },
        { status: 400 }
      );
    }

    let status: StatusType;

    if (totalRefundAmount === existingSale.amountPaid) {
      status = 'REFUNDED';
    } else {
      status = 'PARTIALLY_REFUNDED'; // Has been partially refunded
    }

    const refundDate = data.refundDate ? new Date(data.refundDate) : new Date();

    const result = await prisma.$transaction(
      async tx => {
        const refundPayment = await tx.payment.create({
          data: {
            userId,
            payableType: 'SALE',
            saleId: saleId,
            amount: refundAmount,
            paymentDate: refundDate,
            paymentMethod: (data.paymentMethod ||
              'BANK_TRANSFER') as PaymentMethod,
            category: 'EXPENSE',
            reference: data.reference || null,
            notes: data.refundReason
              ? `Refund for sale ${existingSale.receiptNumber}: ${data.refundReason}`
              : `Refund for sale ${existingSale.receiptNumber}`,
          },
        });

        const updatedSale = await tx.sale.update({
          where: { id: saleId },
          data: {
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
              orderBy: { paymentDate: 'desc' },
            },
          },
        });

        return { sale: updatedSale, payment: refundPayment };
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
        sale: result.sale,
        payment: result.payment,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Sale refund error:', error);

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
