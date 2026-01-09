import { useEffect, useCallback } from 'react';

import { useInventoryStore } from '@/store/inventoryStore';
import { InventoryType } from '@/types/inventory';

// Phase 7.1: Inventory Items for Sale Form
export function useInventoryForSales(isDrawerOpen: boolean) {
  const { fetchInventoryItems, allInventory, isLoading } = useInventoryStore();

  useEffect(() => {
    // Fetch inventory items when sale drawer opens
    if (isDrawerOpen) {
      // Filter for sale-able items: Products, Services, Made-to-Order
      fetchInventoryItems({
        itemType: 'FINISHED_GOOD', // Can be extended to include SERVICE, MADE_TO_ORDER
        showOnStorefront: false,
        isActive: true,
      });
    }
  }, [isDrawerOpen]);

  // Get filtered inventory items for sales
  const saleItems = allInventory.filter(
    item =>
      item.isActive &&
      (item.itemType === 'FINISHED_GOOD' ||
        item.itemType === 'SERVICE' ||
        item.itemType === 'PRODUCED_ITEM')
  );

  return {
    saleItems,
    isLoading,
    refresh: useCallback(() => {
      fetchInventoryItems({
        itemType: 'FINISHED_GOOD',
        showOnStorefront: false,
        isActive: true,
      });
    }, [fetchInventoryItems]),
  };
}

// Phase 7.2: Raw Materials for Production Form
export function useRawMaterialsForProduction(isDrawerOpen: boolean) {
  const { fetchInventoryItems, allInventory, isLoading } = useInventoryStore();

  useEffect(() => {
    // Fetch inventory items when production drawer opens
    if (isDrawerOpen) {
      // Filter for raw materials only
      fetchInventoryItems({
        itemType: 'RAW_MATERIAL',
        isActive: true,
      });
    }
  }, [isDrawerOpen]);

  // Get filtered raw materials for production
  const rawMaterials = allInventory.filter(
    item => item.itemType === 'RAW_MATERIAL' && item.isActive
  );

  return {
    rawMaterials,
    isLoading,
    refresh: useCallback(() => {
      fetchInventoryItems({
        itemType: 'RAW_MATERIAL',
        isActive: true,
      });
    }, [fetchInventoryItems]),
  };
}

// Phase 7.3: Storefront Data (Periodic Refresh)
export function useStorefrontData(refreshInterval: number = 30000) {
  // Default: 30 seconds
  const { fetchStorefrontItems, storefrontItems, isLoading } =
    useInventoryStore();

  useEffect(() => {
    // Initial fetch on mount
    fetchStorefrontItems({ showOnStorefront: true, isActive: true });

    // Set up periodic refresh for stock updates
    const interval = setInterval(() => {
      fetchStorefrontItems({ showOnStorefront: true, isActive: true });
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, fetchStorefrontItems]);

  return {
    storefrontItems,
    isLoading,
    forceRefresh: useCallback(() => {
      fetchStorefrontItems({ showOnStorefront: true, isActive: true });
    }, [fetchStorefrontItems]),
  };
}

// Helper: Check if inventory needs refresh
export function useInventoryRefresh(refreshInterval: number = 5 * 60 * 1000) {
  // Default: 5 minutes
  const { fetchInventoryItems, lastFetchTime } = useInventoryStore();

  useEffect(() => {
    // Periodically refresh inventory data
    const interval = setInterval(() => {
      fetchInventoryItems();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, fetchInventoryItems]);

  // Get items that need refresh (stale data)
  const needsRefresh = useCallback(
    (itemId?: string) => {
      if (!lastFetchTime) return true;
      const now = Date.now();
      const age = now - lastFetchTime;
      return age > refreshInterval;
    },
    [lastFetchTime, refreshInterval]
  );

  return {
    needsRefresh,
  };
}

// Phase 8: Insufficient Stock Handling
export function useStockAvailability(
  itemId: string | undefined,
  quantity: number
) {
  const { allInventory, getItemById } = useInventoryStore();

  const checkAvailability = useCallback(
    (itemId: string | undefined, quantity: number) => {
      if (!itemId) return { available: true, item: null };

      const item = getItemById(itemId);
      if (!item) return { available: true, item: null };

      if (!item.trackInventory) {
        return {
          available: true,
          item,
          message: 'Inventory tracking not enabled',
        };
      }

      const available = item.quantityOnHand >= quantity;
      const lowStock = item.quantityOnHand < (item.reorderLevel || 0);

      let message = '';
      let severity: 'success' | 'warning' | 'error' = 'success';

      if (!available) {
        severity = 'error';
        message = `Only ${item.quantityOnHand} units available. Requested: ${quantity}`;
      } else if (lowStock) {
        severity = 'warning';
        message = `Low stock. Current: ${item.quantityOnHand}, Reorder at: ${item.reorderLevel || 0}`;
      }

      return {
        available,
        item,
        quantityOnHand: item.quantityOnHand,
        reorderLevel: item.reorderLevel,
        isLowStock: lowStock,
        message,
        severity,
      };
    },
    [getItemById]
  );

  return checkAvailability(itemId, quantity);
}

// Phase 8. Stock Actions (Optimistic Updates)
export function useStockActions() {
  const { allInventory, createStockAdjustment, checkStockAvailability } =
    useInventoryStore();

  // Deduct stock optimistically (for sale item addition)
  const deductStockOptimistic = useCallback(
    (itemId: string, quantity: number) => {
      const item = allInventory.find(i => i.id === itemId);
      if (!item) return null;

      const updatedItem = {
        ...item,
        quantityOnHand: Math.max(0, item.quantityOnHand - quantity),
      };

      // Note: This would be handled in the parent component
      // Backend handles actual stock deduction
      // This is for optimistic UI updates
      return updatedItem;
    },
    [allInventory]
  );

  // Add stock optimistically (for purchase completion)
  const addStockOptimistic = useCallback(
    (itemId: string, quantity: number) => {
      const item = allInventory.find(i => i.id === itemId);
      if (!item) return null;

      const updatedItem = {
        ...item,
        quantityOnHand: item.quantityOnHand + quantity,
      };

      return updatedItem;
    },
    [allInventory]
  );

  // Restore stock on error (rollback)
  const restoreStock = useCallback(
    (itemId: string, quantity: number) => {
      const item = allInventory.find(i => i.id === itemId);
      if (!item) return null;

      const updatedItem = {
        ...item,
        quantityOnHand: item.quantityOnHand + quantity, // Add back what was deducted
      };

      return updatedItem;
    },
    [allInventory]
  );

  return {
    deductStockOptimistic,
    addStockOptimistic,
    restoreStock,
    checkStockAvailability,
    createStockAdjustment,
  };
}

// Phase 8.3: Cost Calculation Utilities
export function useCostCalculation() {
  // Weighted Average Cost Calculation
  const calculateWeightedAverage = useCallback(
    (
      oldQuantity: number,
      oldCost: number,
      newQuantity: number,
      newCost: number
    ): number => {
      if (oldQuantity + newQuantity === 0) return 0;

      const totalValue = oldQuantity * oldCost + newQuantity * newCost;
      const totalQuantity = oldQuantity + newQuantity;

      return totalValue / totalQuantity;
    },
    []
  );

  // Calculate COGS (Cost of Goods Sold)
  const calculateCOGS = useCallback(
    (unitCost: number, quantitySold: number): number => {
      return unitCost * quantitySold;
    },
    []
  );

  // Calculate Profit
  const calculateProfit = useCallback(
    (sellingPrice: number, unitCost: number): number => {
      return sellingPrice - unitCost;
    },
    []
  );

  return {
    calculateWeightedAverage,
    calculateCOGS,
    calculateProfit,
  };
}

// Phase 8.5: Refund Handling with Inventory
export function useRefundHandling() {
  const { allInventory, createStockAdjustment } = useInventoryStore();

  // Process refund - Return stock to inventory
  const processRefund = useCallback(
    async (
      saleId: string,
      refundItems: Array<{
        id: string;
        inventoryItemId: string | null;
        quantity: number;
        unitPrice: number;
      }>
    ) => {
      // For each refunded item with inventoryItemId
      for (const refundItem of refundItems) {
        if (refundItem.inventoryItemId) {
          // Create stock adjustment to return quantity to inventory
          await createStockAdjustment({
            inventoryItemId: refundItem.inventoryItemId,
            adjustmentType: 'FOUND', // "Found" = stock return
            quantity: refundItem.quantity,
            reason: `Refund for sale ${saleId}`,
            notes: `Sale ID: ${saleId}, Item ID: ${refundItem.id}`,
          });
        }
      }

      // Note: Sale status would be updated to REFUNDED by the parent component
      // Inventory is automatically updated via stock adjustment
    },
    [createStockAdjustment]
  );

  // Process partial refund
  const processPartialRefund = useCallback(
    async (
      saleItemId: string,
      quantity: number,
      inventoryItemId: string | null
    ) => {
      if (inventoryItemId) {
        // Create stock adjustment for partial quantity return
        await createStockAdjustment({
          inventoryItemId,
          adjustmentType: 'FOUND',
          quantity: quantity,
          reason: `Partial refund for sale item ${saleItemId}`,
          notes: `Sale Item ID: ${saleItemId}`,
        });
      }
    },
    [createStockAdjustment]
  );

  return {
    processRefund,
    processPartialRefund,
  };
}

// Phase 8.6: Production Cost Tracking
export function useProductionCostTracking() {
  const {
    allProductions,
    getProductionById,
  } = require('@/store/productionStore');

  // Track how production costs affect inventory average costs
  const getProductionImpact = useCallback(
    (productionId: string) => {
      const production = getProductionById(productionId);
      if (!production) return null;

      const {
        outputQuantity,
        totalCost,
        addToInventory,
        outputInventoryItemId,
      } = production;

      // If production is added to inventory
      if (addToInventory && outputInventoryItemId) {
        return {
          inventoryItemId: outputInventoryItemId,
          quantity: outputQuantity,
          newAverageCost: totalCost / outputQuantity, // Production unit cost becomes average
          impact: 'add_to_inventory',
        };
      }

      // If production is made-to-order (linked to sale)
      if (!addToInventory && production.saleId) {
        return {
          inventoryItemId: outputInventoryItemId, // Would be the sale item's inventory
          quantity: outputQuantity,
          newAverageCost: totalCost / outputQuantity,
          impact: 'made_to_order',
        };
      }

      return {
        inventoryItemId: outputInventoryItemId,
        quantity: outputQuantity,
        newAverageCost: totalCost / outputQuantity,
        impact: 'update_inventory',
      };
    },
    [getProductionById]
  );

  return {
    getProductionImpact,
  };
}

// Phase 8.7: Delete Handling
export function useDeleteHandling() {
  // Delete handling with inventory impact
  // This would be implemented based on business requirements

  // Option A: Hard Delete with Reversal
  // - Add quantity back to inventory
  // - Recalculate average costs
  // - Risk: Disrupts accounting if done after fiscal close

  // Option B: Soft Delete (Recommended)
  // - Add deletedAt field
  // - Mark as deleted, hide from lists
  // - Don't reverse inventory (maintain audit trail)
  // - Or add CANCELLED status

  const getDeleteImpact = useCallback(
    (itemId: string, type: 'sale' | 'purchase' | 'quotation' | 'inventory') => {
      // This would analyze the impact of deletion
      // And return appropriate action

      return {
        shouldReverseInventory: type === 'sale', // Sales reduce inventory
        shouldRecalculateCosts: type === 'purchase', // Purchases update average costs
        shouldArchiveRecord: type === 'inventory', // Inventory items should be archived
      };
    },
    []
  );

  return {
    getDeleteImpact,
  };
}

// Phase 8.6: Production Without Immediate Sale
export function useBatchProduction() {
  const {
    allProductions,
    getProductionById,
  } = require('@/store/productionStore');
  const { allInventory, updateInventoryItem } = useInventoryStore();

  // Process batch production (e.g., bakery makes 24 cupcakes overnight)
  const createBatchProduction = useCallback(async (productionData: any) => {
    // Create production
    // const production = await createProduction(productionData);
    // If addToInventory = true, output is added to inventory
    // Average cost in inventory is updated by backend
    // This affects all items sold from this batch
  }, []);

  const getInventoryCostImpact = useCallback(
    (productionId: string) => {
      const production = getProductionById(productionId);
      if (!production) return null;

      const {
        outputQuantity,
        totalCost,
        addToInventory,
        outputInventoryItemId,
      } = production;

      if (!addToInventory || !outputInventoryItemId) return null;

      // Production cost becomes average cost in inventory
      return {
        inventoryItemId: outputInventoryItemId,
        quantityProduced: outputQuantity,
        unitCost: totalCost / outputQuantity,
        impact: 'batch_production_cost',
      };
    },
    [getProductionById]
  );

  return {
    createBatchProduction,
    getInventoryCostImpact,
  };
}
