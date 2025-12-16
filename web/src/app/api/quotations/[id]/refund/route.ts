import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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
    const quotationId = id;

    // Check if quotation exists and belongs to user
    const existingQuotation = await prisma.quotation.findFirst({
      where: { id: quotationId, userId },
    });

    if (!existingQuotation) {
      return NextResponse.json(
        { message: 'Quotation not found or unauthorized' },
        { status: 404 }
      );
    }

    const data = await validateRequest(request, RefundSchema);

    // Validate refund conditions
    if (existingQuotation.amountPaid === 0) {
      return NextResponse.json(
        { message: 'Cannot refund a quotation with no payments' },
        { status: 400 }
      );
    }

    const refundAmount = toTwoDecimals(data.refundAmount);

    // Validate refund amount doesn't exceed amount paid
    if (refundAmount > existingQuotation.amountPaid) {
      return NextResponse.json(
        { message: 'Refund amount cannot exceed amount paid' },
        { status: 400 }
      );
    }

    // Check if adding this refund would exceed total paid
    const existingRefundAmount = existingQuotation.refundAmount || 0;
    const totalRefundAmount = toTwoDecimals(
      existingRefundAmount + refundAmount
    );

    if (totalRefundAmount > existingQuotation.amountPaid) {
      return NextResponse.json(
        { message: 'Total refund amount cannot exceed amount paid' },
        { status: 400 }
      );
    }

    let status: StatusType;

    if (totalRefundAmount === existingQuotation.amountPaid) {
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
            payableType: 'QUOTATION',
            quotationId: quotationId,
            amount: refundAmount,
            paymentDate: refundDate,
            paymentMethod: (data.paymentMethod ||
              'BANK_TRANSFER') as PaymentMethod,
            category: 'EXPENSE',
            reference: data.reference || null,
            notes: data.refundReason
              ? `Refund for Quotation ${existingQuotation.quotationNumber}: ${data.refundReason}`
              : `Refund for Quotation ${existingQuotation.quotationNumber}`,
          },
        });

        const updatedQuotation = await tx.quotation.update({
          where: { id: quotationId },
          data: {
            amountPaid: existingQuotation.amountPaid - refundAmount,
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

        return { quotation: updatedQuotation, payment: refundPayment };
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
        quotation: result.quotation,
        payment: result.payment,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('quotation refund error:', error);

    if (error instanceof NextResponse) return error;

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
