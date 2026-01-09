import { Prisma } from '@prisma/client';
import { toTwoDecimals } from '@/lib/fn';
import type {
  PurchaseItem,
  InventoryRestockRecords,
  BusinessExpenseRecords,
  AssetPurchaseRecords,
  PersonalExpenseRecords,
} from '@/types/purchases';

type TransactionClient = Prisma.TransactionClient;

/**
 * Generate SKU for new inventory items
 * SKU = Stock Keeping Unit - A unique identifier for inventory tracking
 * Format: First 3 letters of name + random 4 digits
 */
export function generateSKU(itemName: string): string {
  const prefix = itemName
    .replace(/[^a-zA-Z]/g, '')
    .substring(0, 3)
    .toUpperCase();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${randomNum}`;
}

/**
 * Handle INVENTORY_RESTOCK purchases
 * - Updates existing inventory items
 * - Creates new inventory items if needed
 * - Records stock adjustments
 *
 * Note: Other costs (shipping, handling) and VAT are NOT included in inventory cost.
 * They are recorded as business expenses separately.
 */
export async function handleInventoryRestock(
  tx: TransactionClient,
  purchase: any,
  items: PurchaseItem[],
  userId: string
): Promise<InventoryRestockRecords> {
  const inventoryUpdates = [];
  const stockAdjustments = [];
  const newInventoryItems = [];

  for (const item of items) {
    if (item.inventoryItemId) {
      // Try to find inventory item by ID first, then by SKU if ID lookup fails
      let inventoryItem = await tx.inventoryItem.findFirst({
        where: {
          id: item.inventoryItemId,
          userId,
        },
      });

      // If not found by ID and we have an SKU, try searching by SKU
      if (!inventoryItem && item.sku) {
        inventoryItem = await tx.inventoryItem.findFirst({
          where: {
            sku: item.sku,
            userId,
          },
        });
      }

      // If still not found and inventoryItemId looks like a display string (contains parentheses),
      // extract the SKU from it and search
      if (!inventoryItem && item.inventoryItemId.includes('(')) {
        const skuMatch = item.inventoryItemId.match(/\(([^)]+)\)/);
        if (skuMatch) {
          const extractedSku = skuMatch[1];
          inventoryItem = await tx.inventoryItem.findFirst({
            where: {
              sku: extractedSku,
              userId,
            },
          });
        }
      }

      if (!inventoryItem) {
        throw new Error(`Inventory item not found: ${item.inventoryItemId}`);
      }

      const oldQuantity = inventoryItem.quantityOnHand;
      const oldAverageCost = inventoryItem.averageCost || 0;
      const newQuantity = toTwoDecimals(oldQuantity + item.quantity);

      // Weighted average cost formula
      // Only the item's unit price is used, not other costs
      const newAverageCost =
        oldQuantity === 0
          ? item.unitPrice
          : toTwoDecimals(
              (oldQuantity * oldAverageCost + item.quantity * item.unitPrice) /
                newQuantity
            );

      // Update inventory item
      // Also update selling price if provided (allows price adjustments during restock)
      const updateData: any = {
        quantityOnHand: newQuantity,
        averageCost: newAverageCost,
        lastPurchaseCost: item.unitPrice,
      };

      // Update selling price if explicitly provided in the purchase item
      if (item.sellingPrice !== undefined && item.sellingPrice !== null) {
        updateData.sellingPrice = item.sellingPrice;
      }

      const updated = await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: updateData,
      });

      inventoryUpdates.push(updated);

      // Create stock adjustment record
      const adjustment = await tx.stockAdjustment.create({
        data: {
          userId,
          inventoryItemId: inventoryItem.id,
          adjustmentType: 'RESTOCK',
          quantity: item.quantity,
          oldQuantity,
          newQuantity,
          unitCost: item.unitPrice,
          totalCost: item.amount,
          sourcePurchaseId: purchase.id,
          reason: `Restocked from ${purchase.vendorName}`,
          notes: item.description || null,
        },
      });

      stockAdjustments.push(adjustment);
    } else if (item.addToInventory) {
      // Generate SKU if not provided
      const sku = item.sku || generateSKU(item.itemName);

      // Determine showOnStorefront based on category
      const showOnStorefront =
        item.category !== 'RAW_MATERIAL'
          ? (item.showOnStorefront ?? true)
          : false;

      // Create new inventory item
      const newItem = await tx.inventoryItem.create({
        data: {
          userId,
          name: item.itemName,
          description: item.description || null,
          sku,
          category: item.category || null,
          unit: item.unit || 'unit',
          itemType: (item.category as any) || 'RAW_MATERIAL',
          quantityOnHand: item.quantity,
          averageCost: item.unitPrice,
          lastPurchaseCost: item.unitPrice,
          sellingPrice: item.sellingPrice || null,
          reorderLevel: item.reorderLevel || null,
          trackInventory: true,
          isActive: true,
          showOnStorefront,
        },
      });

      newInventoryItems.push(newItem);

      // Create initial stock adjustment
      const adjustment = await tx.stockAdjustment.create({
        data: {
          userId,
          inventoryItemId: newItem.id,
          adjustmentType: 'RESTOCK',
          quantity: item.quantity,
          oldQuantity: 0,
          newQuantity: item.quantity,
          unitCost: item.unitPrice,
          totalCost: item.amount,
          sourcePurchaseId: purchase.id,
          reason: `Initial stock from purchase ${purchase.purchaseNumber}`,
        },
      });

      stockAdjustments.push(adjustment);
    }
  }

  return {
    type: 'INVENTORY_RESTOCK',
    inventoryUpdates,
    newInventoryItems,
    stockAdjustments,
  };
}

/**
 * Handle BUSINESS_EXPENSE purchases
 * - Creates expense records for tax/accounting
 */
export async function handleBusinessExpense(
  tx: TransactionClient,
  purchase: any,
  items: PurchaseItem[],
  userId: string
): Promise<BusinessExpenseRecords> {
  const expenses = [];

  for (const item of items) {
    if (!item.expenseCategory) {
      throw new Error(
        `Expense category is required for business expense: ${item.itemName}`
      );
    }

    const expense = await tx.expense.create({
      data: {
        userId,
        category: item.expenseCategory as any,
        subCategory: item.description || null,
        amount: item.amount,
        description: `${item.itemName}${item.description ? ` - ${item.description}` : ''}`,
        date: purchase.purchaseDate,
        vendorName: purchase.vendorName,
        isDeductible: item.isDeductible ?? true,
        deductionPercentage: item.deductionPercentage ?? 100,
        reference: purchase.purchaseNumber,
        customerId: purchase.customerId || null,
      },
    });

    expenses.push(expense);
  }

  return {
    type: 'BUSINESS_EXPENSE',
    expenses,
  };
}

/**
 * Handle ASSET_PURCHASE purchases
 * - Creates fixed asset records
 */
export async function handleAssetPurchase(
  tx: TransactionClient,
  purchase: any,
  items: PurchaseItem[],
  userId: string
): Promise<AssetPurchaseRecords> {
  const assets = [];

  for (const item of items) {
    if (!item.assetCategory) {
      throw new Error(
        `Asset category is required for asset purchase: ${item.itemName}`
      );
    }

    const acquisitionDate =
      item.acquisitionDate instanceof Date
        ? item.acquisitionDate
        : item.acquisitionDate
          ? new Date(item.acquisitionDate)
          : purchase.purchaseDate;

    const asset = await tx.fixedAsset.create({
      data: {
        userId,
        name: item.itemName,
        category: item.assetCategory as any,
        acquisitionCost: item.amount,
        acquisitionDate,
        currentValue: item.amount,
        depreciationRate: item.depreciationRate || null,
        residualValue: item.residualValue || 0,
        description: item.description || null,
        status: 'ACTIVE',
        valueHistory: [
          {
            date: purchase.purchaseDate,
            value: item.amount,
            note: 'Initial acquisition',
          },
        ],
      },
    });

    assets.push(asset);
  }

  return {
    type: 'ASSET_PURCHASE',
    assets,
  };
}

/**
 * Handle PERSONAL_EXPENSE purchases
 * - Creates owner equity withdrawal record
 */
export async function handlePersonalExpense(
  tx: TransactionClient,
  purchase: any,
  items: PurchaseItem[],
  userId: string
): Promise<PersonalExpenseRecords> {
  // Calculate total personal expense
  const totalPersonalExpense = items.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  // Create owner drawing (equity withdrawal)
  const ownerEquity = await tx.ownerEquity.create({
    data: {
      userId,
      type: 'OWNER_DRAWING',
      amount: -totalPersonalExpense,
      date: purchase.purchaseDate,
      shareholderName: null,
      description: `Personal expense: ${purchase.title}`,
      reference: purchase.purchaseNumber,
      notes: purchase.description || null,
    },
  });

  return {
    type: 'PERSONAL_EXPENSE',
    ownerEquity,
    totalAmount: totalPersonalExpense,
  };
}

/**
 * Helper: Calculate weighted average cost
 */
export function calculateAverageCost(
  oldQty: number,
  oldCost: number,
  newQty: number,
  newCost: number
): number {
  if (oldQty === 0) return newCost;
  return toTwoDecimals(
    (oldQty * oldCost + newQty * newCost) / (oldQty + newQty)
  );
}
