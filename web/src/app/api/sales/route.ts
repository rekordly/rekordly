import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { resolveCustomer } from '@/lib/utils/customer';
import { CreateSaleSchema } from '@/lib/validations/sales';
import { generateReceiptNumber, toTwoDecimals } from '@/lib/fn';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const body = await request.json();
    const validationResult = CreateSaleSchema.safeParse(body);

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

    const { customerId, customerName, customerEmail, customerPhone } =
      await resolveCustomer(userId, data.customer, data.addAsNewCustomer);

    // Generate unique receipt number
    let receiptNumber = generateReceiptNumber(userId);
    let attempts = 0;

    while (attempts < 5) {
      const existing = await prisma.sale.findUnique({
        where: { receiptNumber },
      });

      if (!existing) break;
      receiptNumber = generateReceiptNumber(userId);
      attempts++;
    }

    if (attempts >= 5) {
      return NextResponse.json(
        {
          message:
            'Failed to generate unique receipt number. Please try again.',
        },
        { status: 500 }
      );
    }

    // Process items with proper decimal conversion
    const items = data.items.map(item => ({
      ...item,
      unitPrice: toTwoDecimals(item.unitPrice),
      total: toTwoDecimals(item.total),
    }));

    // Process other expenses with proper decimal conversion
    const otherSaleExpenses = (data.otherSaleExpenses || []).map(expense => ({
      ...expense,
      amount: toTwoDecimals(expense.amount),
    }));

    // Calculate totals
    const otherCostsTotal = otherSaleExpenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    // Determine status based on payment
    let status: 'PAID' | 'UNPAID' | 'PARTIALLY_PAID' = 'UNPAID';
    const totalAmount = toTwoDecimals(data.totalAmount);
    const amountPaid = toTwoDecimals(data.amountPaid || 0);
    const balance = toTwoDecimals(data.balance);

    if (amountPaid >= totalAmount) {
      status = 'PAID';
    } else if (amountPaid > 0) {
      status = 'PARTIALLY_PAID';
    }

    // Use sale date or current time
    const saleDate = data.saleDate ? new Date(data.saleDate) : new Date();

    // Create sale with transaction to ensure payment is created if amount paid
    const result = await prisma.$transaction(async tx => {
      // Create the sale
      const sale = await tx.sale.create({
        data: {
          receiptNumber,
          userId,
          sourceType: data.sourceType || 'DIRECT',
          invoiceId: data.invoiceId || null,
          customerId,
          customerName,
          customerEmail,
          customerPhone,
          title: data.title,
          description: data.description || null,
          items,
          subtotal: toTwoDecimals(data.subtotal),
          discountType: data.discountType || null,
          discountValue: data.discountValue
            ? toTwoDecimals(data.discountValue)
            : null,
          discountAmount: toTwoDecimals(data.discountAmount || 0),
          deliveryCost: toTwoDecimals(data.deliveryCost || 0),
          otherSaleExpenses,
          totalSaleExpenses: toTwoDecimals(data.totalSaleExpenses || 0),
          includeVAT: data.includeVAT,
          vatAmount: toTwoDecimals(data.vatAmount || 0),
          totalAmount,
          amountPaid,
          balance,
          status,
          saleDate,
        },
      });

      // Create payment record if amount was paid
      let payment = null;
      if (amountPaid > 0) {
        payment = await tx.payment.create({
          data: {
            userId,
            payableType: 'SALE',
            saleId: sale.id,
            amount: amountPaid,
            paymentDate: saleDate,
            paymentMethod: data.paymentMethod || 'BANK_TRANSFER',
            category: 'INCOME',
            notes: `Payment for sale ${receiptNumber}`,
          },
        });
      }

      return { sale, payment };
    });

    return NextResponse.json(
      {
        message: 'Sale created successfully',
        success: true,
        sale: result.sale,
        payment: result.payment,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create sale error:', error);

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

// GET /api/sales - Get all sales
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const sourceType = searchParams.get('sourceType');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (sourceType) where.sourceType = sourceType;

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
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
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
            },
          },
          payments: {
            select: {
              id: true,
              saleId: true,
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        sales,
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
    console.error('Get sales error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
