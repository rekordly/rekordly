import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthUser } from '@/lib/utils/server';
import { addPaymentSchema } from '@/lib/validations/general';
import { generateReceiptNumber, toTwoDecimals } from '@/lib/fn';
import { prisma } from '@/lib/prisma';
import { validateRequest } from '@/lib/utils/validation';
import { PaymentMethod } from '@prisma/client';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { userId } = await getAuthUser(request);

    const data = await validateRequest(request, addPaymentSchema);
    const amountPaid = toTwoDecimals(data.amountPaid);

    // ✅ Fetch invoice with minimal data first (outside transaction)
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        userId,
      },
      select: {
        id: true,
        userId: true,
        customerId: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        title: true,
        description: true,
        includeVAT: true,
        items: true,
        amount: true,
        vatAmount: true,
        totalAmount: true,
        sale: {
          select: {
            id: true,
            amountPaid: true,
            balance: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { message: 'Invoice not found' },
        { status: 404 }
      );
    }

    // If invoice already has a sale, add payment to existing sale
    if (invoice.sale) {
      const existingBalance = toTwoDecimals(invoice.sale.balance);
      const existingAmountPaid = toTwoDecimals(invoice.sale.amountPaid);

      if (existingBalance === 0) {
        return NextResponse.json(
          { message: 'Invoice is already fully paid' },
          { status: 400 }
        );
      }

      if (amountPaid > existingBalance) {
        return NextResponse.json(
          { message: 'Amount paid cannot exceed remaining balance' },
          { status: 400 }
        );
      }

      const newBalance = toTwoDecimals(existingBalance - amountPaid);
      const newTotalPaid = toTwoDecimals(existingAmountPaid + amountPaid);
      const newStatus = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';
      const paymentDate = data.paymentDate
        ? new Date(data.paymentDate)
        : new Date();

      // ✅ Optimized transaction with increased timeout
      await prisma.$transaction(
        async tx => {
          // Create payment record
          await tx.payment.create({
            data: {
              userId,
              payableType: 'SALE',
              category: 'INCOME',
              saleId: invoice.sale!.id,
              amount: amountPaid,
              paymentMethod: data.paymentMethod as PaymentMethod,
              reference: data.reference || null,
              notes: data.notes || null,
              paymentDate,
            },
          });

          // Update sale
          await tx.sale.update({
            where: { id: invoice.sale!.id },
            data: {
              amountPaid: newTotalPaid,
              balance: newBalance,
              status: newStatus,
            },
          });

          // Update invoice status if fully paid (without includes)
          if (newBalance === 0) {
            await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                status: 'CONVERTED',
              },
            });
          }
        },
        {
          maxWait: 10000, // 10 seconds
          timeout: 10000, // 10 seconds
        }
      );

      // ✅ Fetch updated invoice OUTSIDE transaction
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          customer: true,
          sale: {
            include: {
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
          },
        },
      });

      return NextResponse.json(
        {
          message: 'Payment added successfully',
          success: true,
          invoice: updatedInvoice,
        },
        { status: 200 }
      );
    }

    // Create new sale from invoice
    const invoiceTotalAmount = toTwoDecimals(invoice.totalAmount);

    if (amountPaid > invoiceTotalAmount) {
      return NextResponse.json(
        { message: 'Amount paid cannot exceed total amount' },
        { status: 400 }
      );
    }

    // ✅ Generate receipt number OUTSIDE transaction
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

    const balance = toTwoDecimals(invoiceTotalAmount - amountPaid);
    const saleStatus =
      balance === 0
        ? 'PAID'
        : balance < invoiceTotalAmount
          ? 'PARTIALLY_PAID'
          : 'UNPAID';

    const invoiceSubtotal = toTwoDecimals(invoice.amount);
    const invoiceVatAmount = toTwoDecimals(invoice.vatAmount || 0);
    const invoiceTotal = toTwoDecimals(invoice.totalAmount);
    const paymentDate = data.paymentDate
      ? new Date(data.paymentDate)
      : new Date();

    // Parse invoice items
    const invoiceItems = (invoice.items as any[]) || [];

    // ✅ Optimized transaction with increased timeout
    const result = await prisma.$transaction(
      async tx => {
        // Create sale without items first
        const sale = await tx.sale.create({
          data: {
            receiptNumber,
            userId,
            sourceType: 'FROM_INVOICE',
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            customerName: invoice.customerId ? null : invoice.customerName,
            customerEmail: invoice.customerId ? null : invoice.customerEmail,
            customerPhone: invoice.customerId ? null : invoice.customerPhone,
            title: invoice.title,
            description: invoice.description,
            subtotal: invoiceSubtotal,
            includeVAT: invoice.includeVAT,
            vatAmount: invoiceVatAmount,
            totalAmount: invoiceTotal,
            amountPaid: amountPaid,
            balance: balance,
            status: saleStatus,
            saleDate: paymentDate,
          },
        });

        // Create SaleItem records for each invoice item
        const saleItems = [];
        for (const item of invoiceItems) {
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

            if (inventoryItem) {
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
            }
          } else if (item.productionId) {
            // Handle production-linked items
            const production = await tx.production.findFirst({
              where: {
                id: item.productionId,
                userId,
              },
            });

            if (production) {
              // Use unit cost from production
              costPrice = production.unitCost || 0;
            }
          }

          // Calculate cost and profit
          const itemQuantity = toTwoDecimals(item.quantity || 0);
          const itemUnitPrice = toTwoDecimals(item.price || 0);
          const itemAmount = toTwoDecimals(
            item.amount || itemQuantity * itemUnitPrice
          );

          totalCost = toTwoDecimals(costPrice * itemQuantity);
          profit = toTwoDecimals(itemAmount - totalCost);

          // Create SaleItem record
          const saleItem = await tx.saleItem.create({
            data: {
              saleId: sale.id,
              inventoryItemId: item.inventoryItemId || null,
              productionId: item.productionId || null,
              itemName: item.description || item.name || 'Unnamed Item',
              description: item.description || null,
              quantity: itemQuantity,
              unitPrice: itemUnitPrice,
              amount: itemAmount,
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

        // Create payment record
        const payment = await tx.payment.create({
          data: {
            userId,
            payableType: 'SALE',
            category: 'INCOME',
            saleId: sale.id,
            amount: amountPaid,
            paymentMethod: data.paymentMethod as PaymentMethod,
            reference: data.reference || null,
            notes: data.notes || null,
            paymentDate,
          },
        });

        // Update invoice status (without includes)
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            saleId: sale.id,
            status: 'CONVERTED',
          },
        });

        return { sale, saleItems, payment };
      },
      {
        maxWait: 10000, // 10 seconds
        timeout: 10000, // 10 seconds
      }
    );

    // ✅ Fetch complete invoice OUTSIDE transaction
    const updatedInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        customer: true,
        sale: {
          include: {
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
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Invoice converted to sale successfully',
        success: true,
        invoice: updatedInvoice,
        sale: {
          ...result.sale,
          saleItems: result.saleItems,
        },
        payment: result.payment,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Convert invoice error:', error);

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

    if (z.ZodError) {
      return NextResponse.json(
        {
          message: 'Validation error',
          errors: (error as z.ZodError).flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
