import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { resolveCustomer } from '@/lib/utils/customer';
import { CreatePurchaseSchema } from '@/lib/validations/purchases';
import { generatePurchaseNumber, toTwoDecimals } from '@/lib/fn';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const body = await request.json();
    const validationResult = CreatePurchaseSchema.safeParse(body);

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
    const { customerId, customerName } = await resolveCustomer(
      userId,
      data.customer,
      data.addAsNewCustomer
    );

    // Generate unique purchase number
    let purchaseNumber = generatePurchaseNumber(userId);
    let attempts = 0;

    while (attempts < 5) {
      const existing = await prisma.purchase.findUnique({
        where: { purchaseNumber },
      });

      if (!existing) break;
      purchaseNumber = generatePurchaseNumber(userId);
      attempts++;
    }

    if (attempts >= 5) {
      return NextResponse.json(
        {
          message:
            'Failed to generate unique purchase number. Please try again.',
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

    // Process other costs with proper decimal conversion
    const otherCosts = (data.otherCosts || []).map(cost => ({
      ...cost,
      amount: toTwoDecimals(cost.amount),
    }));

    // Calculate totals
    const otherCostsTotal = otherCosts.reduce(
      (sum, cost) => sum + cost.amount,
      0
    );

    let status: 'PAID' | 'UNPAID' | 'PARTIALLY_PAID' = 'UNPAID';
    const totalAmount = toTwoDecimals(data.totalAmount);
    const amountPaid = toTwoDecimals(data.amountPaid || 0);
    const balance = toTwoDecimals(data.balance);

    if (amountPaid >= totalAmount) {
      status = 'PAID';
    } else if (amountPaid > 0) {
      status = 'PARTIALLY_PAID';
    }

    const purchaseDate = data.purchaseDate
      ? new Date(data.purchaseDate)
      : new Date();

    const result = await prisma.$transaction(
      async tx => {
        // Create purchase
        const purchase = await tx.purchase.create({
          data: {
            purchaseNumber,
            userId,
            customerId,
            vendorName:
              data.customer.name || customerName || 'Unnamed Supplier',
            vendorEmail: data.customer.email || null,
            vendorPhone: data.customer.phone || null,
            title: data.title,
            description: data.description || null,
            items,
            subtotal: toTwoDecimals(data.subtotal),
            otherCosts,
            otherCostsTotal: toTwoDecimals(otherCostsTotal),
            includeVAT: data.includeVAT,
            vatAmount: toTwoDecimals(data.vatAmount || 0),
            totalAmount,
            amountPaid,
            balance,
            status,
            purchaseDate,
          },
          include: {
            customer: true,
          },
        });

        let payment = null;
        if (amountPaid > 0) {
          payment = await tx.payment.create({
            data: {
              userId,
              payableType: 'PURCHASE',
              purchaseId: purchase.id,
              amount: amountPaid,
              paymentDate: purchaseDate,
              paymentMethod: data.paymentMethod || 'BANK_TRANSFER',
              category: 'EXPENSE',
              notes: `Payment for purchase ${purchaseNumber}`,
            },
          });
        }

        const { customer } = purchase;

        return { purchase, payment, customer };
      },
      {
        maxWait: 10000, // 10 seconds
        timeout: 10000, // 10 seconds
      }
    );

    return NextResponse.json(
      {
        message: 'Purchase created successfully',
        success: true,
        customer: result.customer,
        purchase: result.purchase,
        payment: result.payment,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create purchase error:', error);

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

// GET /api/purchases - Get all purchases
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const vendorName = searchParams.get('vendorName');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (vendorName) {
      where.vendorName = {
        contains: vendorName,
        mode: 'insensitive',
      };
    }

    if (startDate || endDate) {
      where.purchaseDate = {};
      if (startDate) where.purchaseDate.gte = new Date(startDate);
      if (endDate) where.purchaseDate.lte = new Date(endDate);
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchase.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        purchases,
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
    console.error('Get purchases error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
