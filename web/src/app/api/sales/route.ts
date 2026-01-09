import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { resolveCustomer } from '@/lib/utils/customer';
import { CreateSaleSchema, SaleItemSchema } from '@/lib/validations/sales';
import { generateReceiptNumber, toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { PaymentMethod } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const data = await validateRequest(request, CreateSaleSchema);
    console.log(JSON.stringify(data, null, 2));

    const { customerId, customerName, customerEmail, customerPhone, customer } =
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

    // Create sale with transaction for atomic inventory updates
    const result = await prisma.$transaction(async tx => {
      // Create sale without items first
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
        include: {
          customer: true,
        },
      });

      // Process items and create SaleItem records
      const saleItems = [];
      for (const item of data.items) {
        let costPrice = 0;
        let totalCost = 0;
        let profit = 0;

        // Handle inventory-linked items
        if (item.inventoryItemId) {
          const inventoryItem = await tx.inventoryItem.findFirst({
            where: {
              id: item.inventoryItemId,
              userId,
            },
          });

          if (!inventoryItem) {
            throw new Error(
              `Inventory item not found: ${item.inventoryItemId}`
            );
          }

          // Check inventory tracking and availability
          if (inventoryItem.trackInventory) {
            if (inventoryItem.quantityOnHand < item.quantity) {
              throw new Error(
                `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantityOnHand}, Requested: ${item.quantity}`
              );
            }

            // Deduct from inventory
            await tx.inventoryItem.update({
              where: { id: inventoryItem.id },
              data: {
                quantityOnHand: toTwoDecimals(
                  inventoryItem.quantityOnHand - item.quantity
                ),
              },
            });
          }

          // Use average cost from inventory
          costPrice = inventoryItem.averageCost || 0;
        } else if (item.productionId) {
          // Handle production-linked items
          const production = await tx.production.findFirst({
            where: {
              id: item.productionId,
              userId,
            },
          });

          if (!production) {
            throw new Error(`Production not found: ${item.productionId}`);
          }

          // Use unit cost from production
          costPrice = production.unitCost || 0;
        } else {
          // Non-inventory item (service or one-time) - use provided cost price
          costPrice = item.costPrice || 0;
        }

        // Calculate cost and profit
        totalCost = toTwoDecimals(costPrice * item.quantity);
        profit = toTwoDecimals(item.amount - totalCost);

        // Create SaleItem record
        const saleItem = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            inventoryItemId: item.inventoryItemId || null,
            productionId: item.productionId || null,
            itemName: item.itemName || 'Unnamed Item',
            description: item.description,
            quantity: toTwoDecimals(item.quantity),
            unitPrice: toTwoDecimals(item.unitPrice),
            amount: toTwoDecimals(item.amount),
            costPrice: toTwoDecimals(costPrice),
            totalCost: toTwoDecimals(totalCost),
            profit: toTwoDecimals(profit),
          },
          include: {
            inventoryItem: {
              select: {
                id: true,
                name: true,
                sku: true,
                itemType: true,
              },
            },
            production: {
              select: {
                id: true,
                productionNumber: true,
              },
            },
          },
        });

        saleItems.push(saleItem);
      }

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
            paymentMethod:
              (data.paymentMethod as PaymentMethod) || 'BANK_TRANSFER',
            category: 'INCOME',
            notes: `Payment for sale ${receiptNumber}`,
          },
        });
      }

      return { sale, saleItems, payment };
    });

    return NextResponse.json(
      {
        message: 'Sale created successfully',
        success: true,
        customer,
        sale: {
          ...result.sale,
          saleItems: result.saleItems,
        },
        payment: result.payment,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create sale error:', error);

    if (error instanceof NextResponse) return error;

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    if (
      error instanceof Error &&
      error.message.includes('Insufficient stock')
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      error.message.includes('Inventory item not found')
    ) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (
      error instanceof Error &&
      error.message.includes('Production not found')
    ) {
      return NextResponse.json({ message: error.message }, { status: 404 });
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
          saleItems: {
            include: {
              inventoryItem: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  itemType: true,
                },
              },
              production: {
                select: {
                  id: true,
                  productionNumber: true,
                },
              },
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    console.log(JSON.stringify(sales, null, 2));

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
