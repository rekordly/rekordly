import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { CreateQuotationSchema } from '@/lib/validations/quotations';
import { generateQuotationNumber, toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { resolveCustomer } from '@/lib/utils/customer';
import { PaymentMethod } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const data = await validateRequest(request, CreateQuotationSchema);

    const { customerId, customerName, customerEmail, customerPhone, customer } =
      await resolveCustomer(userId, data.customer, data.addAsNewCustomer);

    // Generate unique quotation number
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

    // Process line items with proper decimal conversion
    const lineItems = data.lineItems.map(item => ({
      ...item,
      unitPrice: toTwoDecimals(item.unitPrice),
      amount: toTwoDecimals(item.amount),
    }));

    // Process other costs if provided
    const otherCosts =
      data.otherCosts?.map(cost => ({
        ...cost,
        amount: toTwoDecimals(cost.amount),
      })) || [];

    // Store lineItems as JSON in database
    const quotation = await prisma.quotation.create({
      data: {
        quotationNumber,
        userId,
        customerId,
        customerName,
        customerEmail,
        customerPhone,
        title: data.title,
        description: data.description || null,

        // NEW: Universal line items JSON
        lineItems,
        subtotal: toTwoDecimals(data.subtotal),

        discountType: data.discountType || null,
        discountValue: data.discountValue
          ? toTwoDecimals(data.discountValue)
          : null,
        discountAmount: toTwoDecimals(data.discountAmount || 0),

        includeVAT: data.includeVAT,
        vatAmount: toTwoDecimals(data.vatAmount || 0),
        totalAmount: toTwoDecimals(data.totalAmount),

        amountPaid: toTwoDecimals(data.amountPaid || 0),
        balance: toTwoDecimals(data.balance),

        status: data.status || 'DRAFT',
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        issueDate: new Date(data.issueDate),
      },
      include: {
        customer: true,
      },
    });

    // Create payment record if amount was paid
    let payment = null;
    if (data.amountPaid > 0) {
      payment = await prisma.payment.create({
        data: {
          userId,
          payableType: 'QUOTATION',
          quotationId: quotation.id,
          amount: toTwoDecimals(data.amountPaid),
          paymentDate: new Date(data.issueDate),
          paymentMethod:
            (data.paymentMethod as PaymentMethod) || 'BANK_TRANSFER',
          category: 'INCOME',
          notes: `Payment for quotation ${quotationNumber}`,
        },
      });
    }

    return NextResponse.json(
      {
        message:
          quotation.status === 'SENT'
            ? 'Quotation created and sent successfully'
            : 'Quotation saved as draft',
        success: true,
        quotation,
        payment,
        customer,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create quotation error:', error);

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
              category: true,
              payableType: true,
              reference: true,
              notes: true,
            },
            orderBy: {
              paymentDate: 'desc',
            },
          },
          createdPurchases: {
            select: {
              id: true,
              purchaseNumber: true,
              totalAmount: true,
              status: true,
            },
            orderBy: {
              createdAt: 'desc',
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
