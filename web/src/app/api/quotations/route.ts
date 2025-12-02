import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { resolveCustomer } from '@/lib/utils/customer';
import { quotationSchema } from '@/lib/validations/quotations';
import { generateQuotationNumber, toTwoDecimals } from '@/lib/fn';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const body = await request.json();
    const validationResult = quotationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed1',
          message: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    const { customerId, customerName, customerEmail, customerPhone, customer } =
      await resolveCustomer(userId, data.customer, data.addAsNewCustomer);

    let quotationNumber = generateQuotationNumber(userId);
    let attempts = 0;

    while (attempts < 5) {
      const existing = await prisma.quotation.findUnique({
        where: { quotationNumber },
      });

      if (!existing) break;
      quotationNumber = generateQuotationNumber(userId);
      attempts++;
    }

    if (attempts >= 5) {
      return NextResponse.json(
        {
          message:
            'Failed to generate unique quotation number. Please try again.',
        },
        { status: 500 }
      );
    }

    const materials = data.materials.map(item => ({
      ...item,
      unitPrice: toTwoDecimals(item.unitPrice),
      total: toTwoDecimals(item.total),
    }));

    const otherCosts = data.otherCosts.map(item => ({
      ...item,
      amount: toTwoDecimals(item.amount),
    }));

    const quotation = await prisma.quotation.create({
      data: {
        quotationNumber,
        userId,
        customerId,
        customerName,
        customerEmail,
        customerPhone,
        title: data.quotationTitle,
        description: data.quotationDescription,
        materials,
        materialsTotal: toTwoDecimals(data.materialsTotal),
        workmanship: toTwoDecimals(data.workmanship),
        otherCosts,
        otherCostsTotal: toTwoDecimals(data.otherCostsTotal),
        includeVAT: data.includeVAT,
        vatAmount: toTwoDecimals(data.vatAmount || 0),
        totalAmount: toTwoDecimals(data.totalAmount),
        // amountPaid: toTwoDecimals(data.amountPaid || 0),
        balance: toTwoDecimals(data.totalAmount),
        issueDate: new Date(data.issueDate),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        status: data.status || 'DRAFT',
      },
      include: {
        customer: true,
      },
    });

    return NextResponse.json(
      {
        message:
          quotation.status === 'SENT'
            ? 'Quotation created and sent successfully'
            : 'Quotation saved as draft',
        success: true,
        quotation,
        customer,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create quotation error:', error);

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
  } finally {
    await prisma.$disconnect();
  }
}

// GET /api/quotations - Get all quotations
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
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
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.quotation.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        quotations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get quotations error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
