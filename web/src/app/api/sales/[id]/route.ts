import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { resolveCustomer } from '@/lib/utils/customer';
import {
  BaseSaleSchema,
  CreateSaleSchema,
  SaleItemSchema,
} from '@/lib/validations/sales';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { PaymentMethod } from '@prisma/client';

// PATCH /api/sales/[id] - Update sale with inventory reconciliation
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if sale exists and belongs to user
    const existingSale = await prisma.sale.findFirst({
      where: { id, userId },
      include: {
        customer: true,
        saleItems: {
          include: {
            inventoryItem: true,
            production: true,
          },
        },
        payments: true,
      },
    });

    if (!existingSale) {
      return NextResponse.json(
        { message: 'Sale not found or unauthorized' },
        { status: 404 }
      );
    }

    // Use partial schema for updates
    const updateSchema = BaseSaleSchema.partial();
    const data = await validateRequest(request, updateSchema);

    // Validate customer if provided and has an ID
    if (data.customer?.id) {
      const customer = await prisma.customer.findFirst({
        where: {
          id: data.customer.id,
          userId,
        },
      });

      if (!customer) {
        return NextResponse.json(
          { message: 'Customer not found or does not belong to you' },
          { status: 404 }
        );
      }
    }

    // Resolve customer only if customer data is provided
    let customer = null;
    if (data.customer?.customerRole) {
      const resolvedCustomer = await resolveCustomer(
        userId,
        data.customer,
        data.addAsNewCustomer
      );
      customer = resolvedCustomer.customer;
    }

    // Process other expenses with proper decimal conversion if provided
    const otherSaleExpenses = data.otherSaleExpenses?.map(expense => ({
      ...expense,
      amount: toTwoDecimals(expense.amount),
    }));

    // Determine status based on payment if amounts are provided
    let status = undefined;
    if (data.totalAmount !== undefined && data.amountPaid !== undefined) {
      const totalAmount = toTwoDecimals(data.totalAmount);
      const amountPaid = toTwoDecimals(data.amountPaid);

      if (amountPaid >= totalAmount) {
        status = 'PAID';
      } else if (amountPaid > 0) {
        status = 'PARTIALLY_PAID';
      } else {
        status = 'UNPAID';
      }
    }

    // Calculate payment difference if amountPaid is being updated
    const previousAmountPaid = existingSale.amountPaid;
    const newAmountPaid =
      data.amountPaid !== undefined
        ? toTwoDecimals(data.amountPaid)
        : previousAmountPaid;
    const paymentDifference = newAmountPaid - previousAmountPaid;

    const saleDate = data.saleDate ? new Date(data.saleDate) : undefined;

    // Update sale with transaction for inventory reconciliation
    const result = await prisma.$transaction(async tx => {
      let inventoryRestored = false;

      // Handle inventory reconciliation if items are being updated
      if (data.items && data.items.length > 0) {
        // Changed: Use string Set for IDs
        const incomingItemIds = new Set(
          data.items.filter(item => item.id !== undefined).map(item => item.id!)
        );
        const existingItemMap = new Map(
          existingSale.saleItems.map(item => [item.id, item])
        );

        // Remove items that are no longer in the request
        for (const existingItem of existingSale.saleItems) {
          if (!incomingItemIds.has(existingItem.id)) {
            // Item removed - restore inventory
            if (
              existingItem.inventoryItemId &&
              existingItem.inventoryItem?.trackInventory
            ) {
              await tx.inventoryItem.update({
                where: { id: existingItem.inventoryItemId },
                data: {
                  quantityOnHand: toTwoDecimals(
                    existingItem.inventoryItem.quantityOnHand +
                      existingItem.quantity
                  ),
                },
              });
            }

            await tx.saleItem.delete({
              where: { id: existingItem.id },
            });
          }
        }

        // Update or add items
        for (const item of data.items) {
          if (item.id !== undefined) {
            // Updating existing item
            const existingItem = existingItemMap.get(item.id);
            if (existingItem) {
              const quantityDiff = toTwoDecimals(
                item.quantity - existingItem.quantity
              );

              if (quantityDiff !== 0) {
                if (item.inventoryItemId) {
                  const inventoryItem = await tx.inventoryItem.findFirst({
                    where: { id: item.inventoryItemId, userId },
                  });

                  if (inventoryItem && inventoryItem.trackInventory) {
                    if (quantityDiff > 0) {
                      // Increasing quantity - check stock and deduct
                      if (inventoryItem.quantityOnHand < quantityDiff) {
                        throw new Error(
                          `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantityOnHand}, Required: ${quantityDiff}`
                        );
                      }
                      await tx.inventoryItem.update({
                        where: { id: inventoryItem.id },
                        data: {
                          quantityOnHand: toTwoDecimals(
                            inventoryItem.quantityOnHand - quantityDiff
                          ),
                        },
                      });
                    } else {
                      // Decreasing quantity - add back to inventory
                      await tx.inventoryItem.update({
                        where: { id: inventoryItem.id },
                        data: {
                          quantityOnHand: toTwoDecimals(
                            inventoryItem.quantityOnHand +
                              Math.abs(quantityDiff)
                          ),
                        },
                      });
                    }
                  }
                }
              }

              let costPrice = 0;
              if (item.inventoryItemId) {
                const invItem = await tx.inventoryItem.findFirst({
                  where: { id: item.inventoryItemId, userId },
                });
                costPrice = invItem?.averageCost || 0;
              } else if (item.productionId) {
                const prod = await tx.production.findFirst({
                  where: { id: item.productionId, userId },
                });
                costPrice = prod?.unitCost || 0;
              } else {
                costPrice = item.costPrice || existingItem.costPrice;
              }

              const totalCost = toTwoDecimals(costPrice * item.quantity);
              const profit = toTwoDecimals(item.amount - totalCost);

              await tx.saleItem.update({
                where: { id: existingItem.id },
                data: {
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
              });
            }
          } else {
            // Adding new item
            let costPrice = 0;
            if (item.inventoryItemId) {
              const inventoryItem = await tx.inventoryItem.findFirst({
                where: { id: item.inventoryItemId, userId },
              });

              if (inventoryItem?.trackInventory) {
                if (inventoryItem.quantityOnHand < item.quantity) {
                  throw new Error(
                    `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantityOnHand}, Requested: ${item.quantity}`
                  );
                }
                await tx.inventoryItem.update({
                  where: { id: inventoryItem.id },
                  data: {
                    quantityOnHand: toTwoDecimals(
                      inventoryItem.quantityOnHand - item.quantity
                    ),
                  },
                });
              }
              costPrice = inventoryItem?.averageCost || 0;
            } else if (item.productionId) {
              const production = await tx.production.findFirst({
                where: { id: item.productionId, userId },
              });
              costPrice = production?.unitCost || 0;
            } else {
              costPrice = item.costPrice || 0;
            }

            const totalCost = toTwoDecimals(costPrice * item.quantity);
            const profit = toTwoDecimals(item.amount - totalCost);

            await tx.saleItem.create({
              data: {
                saleId: existingSale.id,
                inventoryItemId: item.inventoryItemId || null,
                productionId: item.productionId || null,
                itemName: item.description || 'Unnamed Item',
                description: item.description,
                quantity: toTwoDecimals(item.quantity),
                unitPrice: toTwoDecimals(item.unitPrice),
                amount: toTwoDecimals(item.amount),
                costPrice: toTwoDecimals(costPrice),
                totalCost: toTwoDecimals(totalCost),
                profit: toTwoDecimals(profit),
              },
            });
          }
        }
      }

      // Build update data object
      const updateData: any = {};

      if (data.sourceType !== undefined)
        updateData.sourceType = data.sourceType;
      if (data.invoiceId !== undefined) {
        updateData.invoiceId = data.invoiceId || null;
      }

      if (data.customer) {
        if (data.customer.id) {
          updateData.customerId = data.customer.id;
          updateData.customerName = null;
          updateData.customerEmail = null;
          updateData.customerPhone = null;
        } else {
          updateData.customerId = null;
          updateData.customerName = data.customer.name;
          updateData.customerEmail = data.customer.email || null;
          updateData.customerPhone = data.customer.phone || null;
        }
      }

      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) {
        updateData.description = data.description || null;
      }
      if (data.subtotal !== undefined) {
        updateData.subtotal = toTwoDecimals(data.subtotal);
      }
      if (data.discountType !== undefined) {
        updateData.discountType = data.discountType || null;
      }
      if (data.discountValue !== undefined) {
        updateData.discountValue = data.discountValue
          ? toTwoDecimals(data.discountValue)
          : null;
      }
      if (data.discountAmount !== undefined) {
        updateData.discountAmount = toTwoDecimals(data.discountAmount);
      }
      if (data.deliveryCost !== undefined) {
        updateData.deliveryCost = toTwoDecimals(data.deliveryCost);
      }
      if (otherSaleExpenses) updateData.otherSaleExpenses = otherSaleExpenses;
      if (data.totalSaleExpenses !== undefined) {
        updateData.totalSaleExpenses = toTwoDecimals(data.totalSaleExpenses);
      }
      if (data.includeVAT !== undefined)
        updateData.includeVAT = data.includeVAT;
      if (data.vatAmount !== undefined) {
        updateData.vatAmount = toTwoDecimals(data.vatAmount);
      }
      if (data.totalAmount !== undefined) {
        updateData.totalAmount = toTwoDecimals(data.totalAmount);
      }
      if (data.amountPaid !== undefined) {
        updateData.amountPaid = toTwoDecimals(data.amountPaid);
      }
      if (data.balance !== undefined) {
        updateData.balance = toTwoDecimals(data.balance);
      }
      if (status !== undefined) updateData.status = status;
      if (saleDate) updateData.saleDate = saleDate;

      // Update sale
      const sale = await tx.sale.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
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
        },
      });

      // Handle payment changes only if amountPaid was updated
      let payment = null;
      if (data.amountPaid !== undefined && paymentDifference > 0) {
        // Additional payment made
        payment = await tx.payment.create({
          data: {
            userId,
            payableType: 'SALE',
            saleId: sale.id,
            amount: toTwoDecimals(paymentDifference),
            paymentDate: saleDate || new Date(),
            paymentMethod:
              (data.paymentMethod as PaymentMethod) || 'BANK_TRANSFER',
            category: 'INCOME',
            notes: `Additional payment for sale ${existingSale.receiptNumber}`,
          },
        });
      } else if (data.amountPaid !== undefined && paymentDifference < 0) {
        // Payment reduced - log it for now
        console.warn(`Payment reduced for sale ${id}: ${paymentDifference}`);
      }

      return { sale, payment };
    });

    return NextResponse.json(
      {
        message: 'Sale updated successfully',
        success: true,
        sale: result.sale,
        payment: result.payment,
        customer,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update sale error:', error);

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

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/sales/[id] - Delete sale and restore inventory
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    // Check if sale exists and belongs to user
    const existingSale = await prisma.sale.findFirst({
      where: { id, userId },
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

    // Delete sale with transaction to restore inventory
    await prisma.$transaction(async tx => {
      // Restore inventory for all sale items
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

      // Delete sale (payments and saleItems will be cascade deleted)
      await tx.sale.delete({
        where: { id },
      });
    });

    return NextResponse.json(
      {
        message: 'Sale deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete sale error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/sales/[id] - Get single sale with full details
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const sale = await prisma.sale.findFirst({
      where: { id, userId },
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
                unit: true,
                quantityOnHand: true,
                averageCost: true,
                sellingPrice: true,
              },
            },
            production: {
              select: {
                id: true,
                productionNumber: true,
                outputItemName: true,
                outputQuantity: true,
                unitCost: true,
                status: true,
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

    if (!sale) {
      return NextResponse.json(
        { message: 'Sale not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        sale,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get sale error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
