import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { resolveCustomer } from '@/lib/utils/customer';
import { CreatePurchaseSchema } from '@/lib/validations/purchases';
import { generatePurchaseNumber, toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { PaymentMethod, PurchaseType } from '@prisma/client';
import {
  handleInventoryRestock,
  handleBusinessExpense,
  handleAssetPurchase,
  handlePersonalExpense,
} from '@/lib/handlers/purchase-handlers';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const data = await validateRequest(request, CreatePurchaseSchema);
    console.log(JSON.stringify(data, null, 2));

    const { customerId, customerName, customer } = await resolveCustomer(
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

    // Prepare items with proper decimal conversion
    const processedItems = data.items.map(item => ({
      ...item,
      quantity: toTwoDecimals(item.quantity),
      unitPrice: toTwoDecimals(item.unitPrice),
      amount: toTwoDecimals(item.amount),
    }));

    // Create purchase with transaction
    const result = await prisma.$transaction(
      async tx => {
        // 1. Create purchase record (bookkeeping)
        const purchase = await tx.purchase.create({
          data: {
            purchaseNumber,
            userId,
            purchaseType: data.purchaseType,
            customerId,
            vendorName:
              data.customer.name || customerName || 'Unnamed Supplier',
            vendorEmail: data.customer.email || null,
            vendorPhone: data.customer.phone || null,
            title: data.title,
            description: data.description || null,
            otherCosts,
            otherCostsTotal: toTwoDecimals(otherCostsTotal),
            subtotal: toTwoDecimals(data.subtotal),
            includeVAT: data.includeVAT,
            vatAmount: toTwoDecimals(data.vatAmount || 0),
            totalAmount,
            amountPaid,
            balance,
            status,
            purchaseDate,
            attachments: data.attachments || [],
            sourceQuotationId: data.sourceQuotationId || null,
          },
          include: {
            customer: true,
          },
        });

        // 2. Create purchase items
        const createdItems = await Promise.all(
          processedItems.map(item =>
            tx.purchaseItem.create({
              data: {
                purchaseId: purchase.id,
                inventoryItemId: item.inventoryItemId || null,
                itemName: item.itemName,
                description: item.description || null,
                sku: item.sku || null,
                category: item.category || null,
                unit: item.unit || 'unit',
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.amount,
              },
              include: {
                inventoryItem: true,
              },
            })
          )
        );

        // 3. Handle based on purchase type
        let additionalRecords = null;

        switch (data.purchaseType) {
          case 'INVENTORY_RESTOCK':
            additionalRecords = await handleInventoryRestock(
              tx,
              purchase,
              processedItems,
              userId
            );
            break;

          case 'BUSINESS_EXPENSE':
            additionalRecords = await handleBusinessExpense(
              tx,
              purchase,
              processedItems,
              userId
            );
            break;

          case 'ASSET_PURCHASE':
            additionalRecords = await handleAssetPurchase(
              tx,
              purchase,
              processedItems,
              userId
            );
            break;

          case 'PERSONAL_EXPENSE':
            additionalRecords = await handlePersonalExpense(
              tx,
              purchase,
              processedItems,
              userId
            );
            break;

          default:
            throw new Error(`Unknown purchase type: ${data.purchaseType}`);
        }

        // 4. Create payment record if amount was paid
        let payment = null;
        if (amountPaid > 0) {
          payment = await tx.payment.create({
            data: {
              userId,
              payableType: 'PURCHASE',
              purchaseId: purchase.id,
              amount: amountPaid,
              paymentDate: purchaseDate,
              paymentMethod:
                (data.paymentMethod as PaymentMethod) || 'BANK_TRANSFER',
              category: 'EXPENSE',
              reference: data.reference || null,
              notes: data.notes || `Payment for purchase ${purchaseNumber}`,
            },
          });
        }

        // Fetch complete purchase with items
        const completePurchase = await tx.purchase.findUnique({
          where: { id: purchase.id },
          include: {
            customer: true,
            items: {
              include: {
                inventoryItem: true,
              },
            },
          },
        });

        return { purchase: completePurchase, payment, additionalRecords };
      },
      {
        maxWait: 10000,
        timeout: 10000,
      }
    );

    return NextResponse.json(
      {
        message: 'Purchase created successfully',
        success: true,
        customer,
        purchase: result.purchase,
        payment: result.payment,
        additionalRecords: result.additionalRecords,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create purchase error:', error);

    if (error instanceof NextResponse) return error;

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    if (
      error instanceof Error &&
      error.message.includes('Inventory item not found')
    ) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (
      error instanceof Error &&
      error.message.includes('Unknown purchase type')
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
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
    const purchaseType = searchParams.get('purchaseType');
    const customerId = searchParams.get('customerId');
    const vendorName = searchParams.get('vendorName');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (status) where.status = status;
    if (purchaseType) where.purchaseType = purchaseType;
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
          items: {
            include: {
              inventoryItem: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  category: true,
                },
              },
            },
          },
          sourceQuotation: {
            select: {
              id: true,
              quotationNumber: true,
            },
          },
          payments: {
            select: {
              id: true,
              purchaseId: true,
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
