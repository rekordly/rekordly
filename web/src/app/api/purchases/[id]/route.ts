import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { UpdatePurchaseSchema } from '@/lib/validations/purchases';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { resolveCustomer } from '@/lib/utils/customer';
import {
  handleInventoryRestock,
  handleBusinessExpense,
  handleAssetPurchase,
  handlePersonalExpense,
} from '@/lib/handlers/purchase-handlers';
import type { PurchaseItem } from '@/types/purchases';

// GET /api/purchases/[id] - Get single purchase
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const purchase = await prisma.purchase.findFirst({
      where: {
        id,
        userId,
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
        items: {
          include: {
            inventoryItem: {
              select: {
                id: true,
                name: true,
                sku: true,
                category: true,
                unit: true,
                quantityOnHand: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        sourceQuotation: {
          select: {
            id: true,
            quotationNumber: true,
            status: true,
            totalAmount: true,
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
    });

    if (!purchase) {
      return NextResponse.json(
        { message: 'Purchase not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        purchase,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get purchase error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/purchases/[id] - Update purchase with inventory reconciliation
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const updatePurchaseSchema = UpdatePurchaseSchema.partial();
    const data = await validateRequest(request, updatePurchaseSchema);

    // Check if purchase exists and belongs to user
    const existingPurchase = await prisma.purchase.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        payments: true,
        items: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { message: 'Purchase not found' },
        { status: 404 }
      );
    }

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

    let customer = null;
    if (data.customer?.customerRole) {
      const resolvedCustomer = await resolveCustomer(
        userId,
        data.customer,
        data.addAsNewCustomer
      );
      customer = resolvedCustomer.customer;
    }

    // Process other costs with proper decimal conversion if provided
    const otherCosts = data.otherCosts?.map(cost => ({
      ...cost,
      amount: toTwoDecimals(cost.amount),
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
    const previousAmountPaid = existingPurchase.amountPaid;
    const newAmountPaid =
      data.amountPaid !== undefined
        ? toTwoDecimals(data.amountPaid)
        : previousAmountPaid;
    const paymentDifference = newAmountPaid - previousAmountPaid;

    const purchaseDate =
      data.purchaseDate !== undefined ? new Date(data.purchaseDate) : undefined;

    // Process items with proper decimal conversion if provided
    let processedItems: PurchaseItem[] | undefined;
    if (data.items) {
      processedItems = data.items.map(item => ({
        id: item.id,
        itemName: item.itemName,
        description: item.description,
        quantity: toTwoDecimals(item.quantity),
        unitPrice: toTwoDecimals(item.unitPrice),
        amount: toTwoDecimals(item.amount),
        unit: item.unit || 'unit',
        inventoryItemId: item.inventoryItemId,
        sku: item.sku,
        category: item.category,
        reorderLevel: item.reorderLevel,
        sellingPrice: item.sellingPrice,
        addToInventory: item.addToInventory,
        expenseCategory: item.expenseCategory,
        isDeductible: item.isDeductible,
        deductionPercentage: item.deductionPercentage,
        assetCategory: item.assetCategory,
        depreciationRate: item.depreciationRate,
        residualValue: item.residualValue,
        acquisitionDate: item.acquisitionDate,
      }));
    }

    // Update purchase with transaction
    const result = await prisma.$transaction(async tx => {
      // If items are being updated, handle item changes
      if (processedItems) {
        // Get IDs of items to keep (items with existing IDs)
        const itemIdsToKeep = processedItems
          .filter(item => item.id)
          .map(item => item.id);

        // Delete items that are no longer in the list
        const itemsToDelete = existingPurchase.items.filter(
          item => !itemIdsToKeep.includes(item.id)
        );

        // Reverse inventory for deleted items if INVENTORY_RESTOCK
        if (existingPurchase.purchaseType === 'INVENTORY_RESTOCK') {
          for (const deletedItem of itemsToDelete) {
            if (deletedItem.inventoryItemId) {
              const inventoryItem = await tx.inventoryItem.findFirst({
                where: { id: deletedItem.inventoryItemId, userId },
              });

              if (inventoryItem) {
                const newQuantity = toTwoDecimals(
                  inventoryItem.quantityOnHand - deletedItem.quantity
                );

                await tx.inventoryItem.update({
                  where: { id: inventoryItem.id },
                  data: {
                    quantityOnHand: newQuantity >= 0 ? newQuantity : 0,
                  },
                });

                await tx.stockAdjustment.create({
                  data: {
                    userId,
                    inventoryItemId: deletedItem.inventoryItemId,
                    adjustmentType: 'CORRECTION',
                    quantity: -deletedItem.quantity,
                    oldQuantity: inventoryItem.quantityOnHand,
                    newQuantity: newQuantity >= 0 ? newQuantity : 0,
                    reason: `Item removed from purchase ${existingPurchase.purchaseNumber}`,
                  },
                });
              }
            }
          }
        }

        // Delete the items from database
        await tx.purchaseItem.deleteMany({
          where: {
            id: {
              in: itemsToDelete.map(item => item.id),
            },
          },
        });

        // Update or create items
        for (const item of processedItems) {
          if (item.id) {
            // Update existing item
            const existingItem = existingPurchase.items.find(
              ei => ei.id === item.id
            );

            if (existingItem) {
              // If inventory restock and quantity changed, adjust inventory
              if (
                existingPurchase.purchaseType === 'INVENTORY_RESTOCK' &&
                existingItem.quantity !== item.quantity &&
                existingItem.inventoryItemId
              ) {
                const inventoryItem = await tx.inventoryItem.findFirst({
                  where: { id: existingItem.inventoryItemId, userId },
                });

                if (inventoryItem) {
                  const quantityDiff = item.quantity - existingItem.quantity;
                  const newQuantity = toTwoDecimals(
                    inventoryItem.quantityOnHand + quantityDiff
                  );

                  await tx.inventoryItem.update({
                    where: { id: inventoryItem.id },
                    data: {
                      quantityOnHand: newQuantity >= 0 ? newQuantity : 0,
                    },
                  });

                  await tx.stockAdjustment.create({
                    data: {
                      userId,
                      inventoryItemId: existingItem.inventoryItemId,
                      adjustmentType: 'CORRECTION',
                      quantity: quantityDiff,
                      oldQuantity: inventoryItem.quantityOnHand,
                      newQuantity: newQuantity >= 0 ? newQuantity : 0,
                      reason: `Purchase ${existingPurchase.purchaseNumber} updated`,
                    },
                  });
                }
              }

              // Update the purchase item
              await tx.purchaseItem.update({
                where: { id: item.id },
                data: {
                  itemName: item.itemName,
                  description: item.description || null,
                  sku: item.sku || null,
                  category: item.category || null,
                  unit: item.unit || 'unit',
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  amount: item.amount,
                  inventoryItemId: item.inventoryItemId || null,
                },
              });
            }
          } else {
            // Create new item
            await tx.purchaseItem.create({
              data: {
                purchaseId: id,
                itemName: item.itemName,
                description: item.description || null,
                sku: item.sku || null,
                category: item.category || null,
                unit: item.unit || 'unit',
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.amount,
                inventoryItemId: item.inventoryItemId || null,
              },
            });

            // If new item in INVENTORY_RESTOCK, add to inventory
            if (
              existingPurchase.purchaseType === 'INVENTORY_RESTOCK' &&
              item.inventoryItemId
            ) {
              const inventoryItem = await tx.inventoryItem.findFirst({
                where: { id: item.inventoryItemId, userId },
              });

              if (inventoryItem) {
                const newQuantity = toTwoDecimals(
                  inventoryItem.quantityOnHand + item.quantity
                );

                await tx.inventoryItem.update({
                  where: { id: inventoryItem.id },
                  data: {
                    quantityOnHand: newQuantity,
                  },
                });

                await tx.stockAdjustment.create({
                  data: {
                    userId,
                    inventoryItemId: item.inventoryItemId,
                    adjustmentType: 'RESTOCK',
                    quantity: item.quantity,
                    oldQuantity: inventoryItem.quantityOnHand,
                    newQuantity,
                    reason: `New item added to purchase ${existingPurchase.purchaseNumber}`,
                  },
                });
              }
            }
          }
        }

        // Handle expense records for BUSINESS_EXPENSE type
        if (existingPurchase.purchaseType === 'BUSINESS_EXPENSE') {
          await tx.expense.deleteMany({
            where: {
              userId,
              reference: existingPurchase.purchaseNumber,
            },
          });

          const tempPurchase = { ...existingPurchase, items: processedItems };
          await handleBusinessExpense(tx, tempPurchase, processedItems, userId);
        }

        // Handle equity for PERSONAL_EXPENSE type
        if (existingPurchase.purchaseType === 'PERSONAL_EXPENSE') {
          await tx.ownerEquity.deleteMany({
            where: {
              userId,
              reference: existingPurchase.purchaseNumber,
            },
          });

          const tempPurchase = { ...existingPurchase, items: processedItems };
          await handlePersonalExpense(tx, tempPurchase, processedItems, userId);
        }
      }

      // Prepare update data object
      const updateData: any = {};

      if (data.purchaseType !== undefined)
        updateData.purchaseType = data.purchaseType;
      if (data.customer?.name !== undefined)
        updateData.vendorName = data.customer?.name;
      if (data.customer?.email !== undefined)
        updateData.vendorEmail = data.customer?.email;
      if (data.customer?.phone !== undefined)
        updateData.vendorPhone = data.customer?.phone;
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined)
        updateData.description = data.description;
      if (data.subtotal !== undefined)
        updateData.subtotal = toTwoDecimals(data.subtotal);
      if (otherCosts) updateData.otherCosts = otherCosts;
      if (data.otherCostsTotal !== undefined)
        updateData.otherCostsTotal = toTwoDecimals(data.otherCostsTotal);
      if (data.includeVAT !== undefined)
        updateData.includeVAT = data.includeVAT;
      if (data.vatAmount !== undefined)
        updateData.vatAmount = toTwoDecimals(data.vatAmount || 0);
      if (data.totalAmount !== undefined)
        updateData.totalAmount = toTwoDecimals(data.totalAmount);
      if (data.amountPaid !== undefined)
        updateData.amountPaid = toTwoDecimals(data.amountPaid);
      if (data.balance !== undefined)
        updateData.balance = toTwoDecimals(data.balance);
      if (status !== undefined) updateData.status = status;
      if (data.sourceQuotationId !== undefined)
        updateData.sourceQuotationId = data.sourceQuotationId;
      if (data.attachments !== undefined)
        updateData.attachments = data.attachments;
      if (purchaseDate) updateData.purchaseDate = purchaseDate;

      // Update purchase
      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: updateData,
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
            orderBy: {
              createdAt: 'asc',
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
              reference: true,
              notes: true,
            },
            orderBy: {
              paymentDate: 'desc',
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
            payableType: 'PURCHASE',
            purchaseId: id,
            amount: toTwoDecimals(paymentDifference),
            paymentDate: purchaseDate || new Date(),
            paymentMethod: data.paymentMethod || 'BANK_TRANSFER',
            category: 'EXPENSE',
            notes: `Additional payment for purchase ${existingPurchase.purchaseNumber}`,
          },
        });
      } else if (data.amountPaid !== undefined && paymentDifference < 0) {
        // Payment reduced - log it for now
        console.warn(
          `Payment reduced for purchase ${id}: ${paymentDifference}`
        );
      }

      return { purchase: updatedPurchase, payment };
    });

    return NextResponse.json(
      {
        message: 'Purchase updated successfully',
        success: true,
        purchase: result.purchase,
        payment: result.payment,
        customer,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update purchase error:', error);

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

// DELETE /api/purchases/[id] - Delete purchase and reverse inventory
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { params } = props;
    const { id } = await params;
    const { userId } = await getAuthUser(request);

    const existingPurchase = await prisma.purchase.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        payments: true,
        items: true,
      },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { message: 'Purchase not found' },
        { status: 404 }
      );
    }

    // Delete purchase with transaction to reverse changes
    await prisma.$transaction(async tx => {
      // Reverse based on purchase type
      switch (existingPurchase.purchaseType) {
        case 'INVENTORY_RESTOCK':
          // Reverse inventory for all items
          for (const item of existingPurchase.items) {
            if (item.inventoryItemId) {
              const inventoryItem = await tx.inventoryItem.findFirst({
                where: { id: item.inventoryItemId, userId },
              });

              if (inventoryItem) {
                const newQuantity = toTwoDecimals(
                  inventoryItem.quantityOnHand - item.quantity
                );

                await tx.inventoryItem.update({
                  where: { id: item.inventoryItemId },
                  data: {
                    quantityOnHand: newQuantity >= 0 ? newQuantity : 0,
                  },
                });

                // Create stock adjustment for the reversal
                await tx.stockAdjustment.create({
                  data: {
                    userId,
                    inventoryItemId: item.inventoryItemId,
                    adjustmentType: 'CORRECTION',
                    quantity: -item.quantity,
                    oldQuantity: inventoryItem.quantityOnHand,
                    newQuantity: newQuantity >= 0 ? newQuantity : 0,
                    reason: `Purchase ${existingPurchase.purchaseNumber} deleted`,
                  },
                });
              }
            }
          }
          break;

        case 'BUSINESS_EXPENSE':
          // Delete related expense records
          await tx.expense.deleteMany({
            where: {
              userId,
              reference: existingPurchase.purchaseNumber,
            },
          });
          break;

        case 'ASSET_PURCHASE':
          // Mark assets as disposed or delete (depending on business logic)
          console.warn(
            `Asset purchase ${existingPurchase.purchaseNumber} deleted - manual asset cleanup may be required`
          );
          break;

        case 'PERSONAL_EXPENSE':
          // Delete related owner equity records
          await tx.ownerEquity.deleteMany({
            where: {
              userId,
              reference: existingPurchase.purchaseNumber,
            },
          });
          break;
      }

      // Delete related payments
      await tx.payment.deleteMany({
        where: { purchaseId: id },
      });

      // Delete purchase items (cascade will handle this, but explicit is clearer)
      await tx.purchaseItem.deleteMany({
        where: { purchaseId: id },
      });

      // Delete purchase
      await tx.purchase.delete({
        where: { id },
      });
    });

    return NextResponse.json(
      {
        message: 'Purchase deleted successfully',
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete purchase error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
