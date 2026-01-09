import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { SaleRefundSchema } from '@/lib/validations/general';
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
      include: {
        saleItems: {
          include: {
            inventoryItem: true,
            production: true,
          },
        },
      },
    });

    if (!existingSale) {
      return NextResponse.json(
        { message: 'Sale not found or unauthorized' },
        { status: 404 }
      );
    }

    const data = await validateRequest(request, SaleRefundSchema);

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
      status = 'PARTIALLY_REFUNDED';
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

        // Handle inventory restoration on refund
        // Only restore inventory if it's a full refund or if restoreInventory flag is set
        const restoreInventory = data.restoreInventory !== false; // Default to true

        if (restoreInventory && status === 'REFUNDED') {
          // Full refund - restore all inventory items
          for (const saleItem of existingSale.saleItems) {
            if (
              saleItem.inventoryItemId &&
              saleItem.inventoryItem?.trackInventory
            ) {
              await tx.inventoryItem.update({
                where: { id: saleItem.inventoryItemId },
                data: {
                  quantityOnHand: toTwoDecimals(
                    saleItem.inventoryItem.quantityOnHand + saleItem.quantity
                  ),
                },
              });
            }
          }
        } else if (restoreInventory && data.refundItems) {
          // Partial refund with specific items - restore only those items
          for (const refundItem of data.refundItems) {
            const saleItem = existingSale.saleItems.find(
              si => si.id === refundItem.saleItemId
            );

            if (
              saleItem?.inventoryItemId &&
              saleItem.inventoryItem?.trackInventory
            ) {
              await tx.inventoryItem.update({
                where: { id: saleItem.inventoryItemId },
                data: {
                  quantityOnHand: toTwoDecimals(
                    saleItem.inventoryItem.quantityOnHand + refundItem.quantity
                  ),
                },
              });
            }
          }
        }

        const updatedSale = await tx.sale.update({
          where: { id: saleId },
          data: {
            amountPaid: existingSale.amountPaid - refundAmount,
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
