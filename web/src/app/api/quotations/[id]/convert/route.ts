// app/api/quotations/[id]/payment/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import { prisma } from '@/lib/prisma';
import { addPaymentSchema } from '@/lib/validations/general';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { userId } = await getAuthUser(request);

    const body = await request.json();
    const validationResult = addPaymentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: 'Validation failed',
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const paymentAmount = toTwoDecimals(data.amountPaid);

    const quotation = await prisma.quotation.findFirst({
      where: {
        id: params.id,
        userId,
      },
      select: {
        id: true,
        userId: true,
        quotationNumber: true,
        customerId: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        title: true,
        description: true,
        materials: true,
        materialsTotal: true,
        workmanship: true,
        otherCosts: true,
        otherCostsTotal: true,
        includeVAT: true,
        vatAmount: true,
        totalAmount: true,
        amountPaid: true,
        balance: true,
        status: true,
        issueDate: true,
        payments: {
          select: {
            id: true,
            amount: true,
          },
        },
      },
    });

    if (!quotation) {
      return NextResponse.json(
        { message: 'Quotation not found' },
        { status: 404 }
      );
    }

    const existingBalance = toTwoDecimals(quotation.balance);
    const existingAmountPaid = toTwoDecimals(quotation.amountPaid);

    if (existingBalance === 0) {
      return NextResponse.json(
        { message: 'Quotation is already fully paid' },
        { status: 400 }
      );
    }

    if (paymentAmount > existingBalance) {
      return NextResponse.json(
        { message: 'Payment amount cannot exceed remaining balance' },
        { status: 400 }
      );
    }

    const newBalance = toTwoDecimals(existingBalance - paymentAmount);
    const newTotalPaid = toTwoDecimals(existingAmountPaid + paymentAmount);

    let newStatus = quotation.status;

    if (newBalance === 0) {
      newStatus = 'PAID';
    } else if (newTotalPaid > 0) {
      newStatus = 'PARTIALLY_PAID';
    } else {
      newStatus = 'UNPAID';
    }

    const paymentDate = data.paymentDate
      ? new Date(data.paymentDate)
      : new Date();

    const existingIncomeRecord = await prisma.incomeRecord.findFirst({
      where: {
        sourceType: 'QUOTATION_PAYMENT',
        sourceId: quotation.id,
      },
    });

    await prisma.$transaction(
      async tx => {
        if (paymentAmount > 0) {
          await tx.payment.create({
            data: {
              userId,
              payableType: 'QUOTATION',
              category: 'INCOME',
              quotationId: quotation.id,
              amount: paymentAmount,
              paymentMethod: data.paymentMethod,
              reference: data.reference || null,
              notes: data.notes || null,
              paymentDate,
            },
          });
        }

        // 2. Update quotation
        await tx.quotation.update({
          where: { id: quotation.id },
          data: {
            amountPaid: newTotalPaid,
            balance: newBalance,
            status: newStatus,
          },
        });

        if (!existingIncomeRecord && quotation.workmanship > 0) {
          await tx.incomeRecord.create({
            data: {
              userId,
              mainCategory: 'BUSINESS_PROFIT',
              subCategory: 'SERVICE_FEES',
              sourceType: 'QUOTATION_PAYMENT',
              sourceId: quotation.id,
              grossAmount: toTwoDecimals(quotation.workmanship),
              taxableAmount: toTwoDecimals(quotation.workmanship),
              description: `Workmanship for ${quotation.title || quotation.quotationNumber}`,
              date: paymentDate,
              vatAmount: quotation.includeVAT
                ? toTwoDecimals((quotation.workmanship * 0.075) / 1.075)
                : 0,
            },
          });
        }
      },
      {
        maxWait: 10000,
        timeout: 10000,
      }
    );

    // Fetch updated quotation
    const updatedQuotation = await prisma.quotation.findUnique({
      where: { id: quotation.id },
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
            quotationId: true,
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
        message: !existingIncomeRecord
          ? 'Payment recorded and workmanship income added'
          : 'Payment added successfully',
        success: true,
        quotation: updatedQuotation,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Add quotation payment error:', error);

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
