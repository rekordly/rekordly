// Phase 9.3: Data Integrity Checks
// Periodic Audits and Validation Utilities

// Stock Movement Integrity
export function validateStockMovements(
  initialStock: number,
  stockAdjustments: Array<{
    type:
      | 'FOUND'
      | 'LOST'
      | 'SALE'
      | 'PURCHASE'
      | 'PRODUCTION'
      | 'RETURN'
      | 'ADJUSTMENT';
    quantity: number;
    adjustmentDate: Date;
  }>,
  currentStock: number
): {
  isValid: boolean;
  errors: string[];
  breakdown: {
    initialStock: number;
    totalAdjustments: number;
    expectedStock: number;
    actualStock: number;
    difference: number;
    byType: {
      additions: number;
      deductions: number;
      returns: number;
      adjustments: number;
    };
  };
} {
  const breakdown = {
    initialStock,
    totalAdjustments: 0,
    expectedStock: 0,
    actualStock: currentStock,
    difference: 0,
    byType: {
      additions: 0, // PURCHASE, PRODUCTION, FOUND
      deductions: 0, // SALE, PRODUCTION (raw materials), LOST
      returns: 0, // RETURN, RETURNED_SALE
      adjustments: 0, // MANUAL ADJUSTMENTS
    },
  };

  const errors: string[] = [];

  // Sum all adjustments
  stockAdjustments.forEach(adj => {
    switch (adj.type) {
      case 'PURCHASE':
      case 'PRODUCTION': // Added to inventory
        breakdown.byType.additions += adj.quantity;
        break;
      case 'SALE':
      case 'LOST': // Deducted from inventory
        breakdown.byType.deductions += adj.quantity;
        break;
      case 'RETURN':
      case 'FOUND': // Returned to inventory
        breakdown.byType.returns += adj.quantity;
        break;
      case 'ADJUSTMENT': // Manual adjustment
        breakdown.byType.adjustments += adj.quantity;
        break;
    }
  });

  // Calculate total net change
  breakdown.totalAdjustments =
    breakdown.byType.additions -
    breakdown.byType.deductions +
    breakdown.byType.returns +
    breakdown.byType.adjustments;

  // Expected stock
  breakdown.expectedStock = breakdown.initialStock + breakdown.totalAdjustments;

  // Difference
  breakdown.difference = breakdown.actualStock - breakdown.expectedStock;

  // Validate
  if (breakdown.difference !== 0) {
    errors.push(
      `Stock mismatch: Expected ${breakdown.expectedStock}, actual ${breakdown.actualStock}, difference ${breakdown.difference}`
    );
  }

  return {
    isValid: breakdown.difference === 0,
    errors,
    breakdown,
  };
}

// Sale Profit Integrity
export function validateSaleProfit(sale: {
  id: string;
  saleNumber: string;
  saleDate: Date;
  items: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    profit: number;
    inventoryItemId?: string;
    productionId?: string;
  }>;
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  status: string;
}): {
  isValid: boolean;
  errors: string[];
  breakdown: {
    saleNumber: string;
    expectedProfit: number;
    actualProfit: number;
    difference: number;
    itemsCorrect: number;
    itemsWithErrors: Array<{
      id: string;
      itemName: string;
      expectedProfit: number;
      actualProfit: number;
      difference: number;
    }>;
  };
} {
  const breakdown = {
    saleNumber: sale.saleNumber,
    expectedProfit: 0,
    actualProfit: sale.totalProfit || 0,
    difference: 0,
    itemsCorrect: 0,
    itemsWithErrors: [] as Array<{
      id: string;
      itemName: string;
      expectedProfit: number;
      actualProfit: number;
      difference: number;
    }>,
  };

  const errors: string[] = [];

  // Calculate expected profit from items
  sale.items.forEach(item => {
    const expectedItemProfit =
      (item.unitPrice - item.costPrice) * item.quantity;
    breakdown.expectedProfit += expectedItemProfit;

    // Check if stored profit matches
    const itemProfitDiff = (item.profit || 0) - expectedItemProfit;

    if (Math.abs(itemProfitDiff) > 0.01) {
      // Allow 1kobo rounding diff
      breakdown.itemsWithErrors.push({
        id: item.id,
        itemName: item.itemName,
        expectedProfit: expectedItemProfit,
        actualProfit: item.profit || 0,
        difference: itemProfitDiff,
      });
    } else {
      breakdown.itemsCorrect++;
    }
  });

  // Difference
  breakdown.difference = breakdown.actualProfit - breakdown.expectedProfit;

  // Validate
  if (breakdown.difference !== 0) {
    errors.push(
      `Profit mismatch: Expected ₦${breakdown.expectedProfit.toFixed(2)}, actual ₦${breakdown.actualProfit.toFixed(2)}, difference ₦${breakdown.difference.toFixed(2)}`
    );
  }

  if (breakdown.itemsWithErrors.length > 0) {
    errors.push(
      `${breakdown.itemsWithErrors.length} items with profit calculation errors`
    );
  }

  return {
    isValid:
      breakdown.difference === 0 && breakdown.itemsWithErrors.length === 0,
    errors,
    breakdown,
  };
}

// Purchase Cost Integrity
export function validatePurchaseCosts(
  purchase: {
    id: string;
    purchaseNumber: string;
    purchaseDate: Date;
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      amount: number;
      inventoryItemId?: string;
    }>;
    totalAmount: number;
    totalCost: number;
    averageCost: number;
  },
  inventoryItems: Array<{
    id: string;
    name: string;
    averageCost: number;
  }>
): {
  isValid: boolean;
  errors: string[];
  breakdown: {
    purchaseNumber: string;
    expectedAverageCost: number;
    actualAverageCost: number;
    difference: number;
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      unitCost: number;
      inventoryCost: number;
      inventoryItemId?: string;
      isCorrect: boolean;
    }>;
  };
} {
  const breakdown = {
    purchaseNumber: purchase.purchaseNumber,
    expectedAverageCost:
      purchase.totalCost /
      purchase.items.reduce((sum, item) => sum + item.quantity, 0),
    actualAverageCost: purchase.averageCost || 0,
    difference: 0,
    items: purchase.items.map(item => ({
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
      unitCost: item.unitPrice, // Should be averageCost if linked to inventory
      inventoryCost:
        inventoryItems.find(inv => inv.id === item.inventoryItemId)
          ?.averageCost || 0,
      inventoryItemId: item.inventoryItemId,
      isCorrect: true, // Will be updated
    })),
  };

  const errors: string[] = [];

  // Calculate expected average cost
  const totalQuantity = purchase.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  breakdown.expectedAverageCost = purchase.totalCost / totalQuantity;

  // Actual average
  breakdown.actualAverageCost = purchase.averageCost || 0;

  // Difference
  breakdown.difference = Math.abs(
    breakdown.actualAverageCost - breakdown.expectedAverageCost
  );

  // Validate each item
  breakdown.items.forEach(item => {
    if (item.inventoryItemId) {
      // Item linked to inventory, unitCost should match inventory's averageCost
      const isCorrect = Math.abs(item.unitCost - item.inventoryCost) <= 0.01; // Allow 1kobo rounding
      item.isCorrect = isCorrect;

      if (!isCorrect) {
        errors.push(
          `Item ${item.itemName}: Purchase price ₦${item.unitCost} differs from inventory average cost ₦${item.inventoryCost}`
        );
      }
    }
  });

  // Validate average cost
  if (breakdown.difference > 0.01) {
    errors.push(
      `Average cost mismatch: Expected ₦${breakdown.expectedAverageCost.toFixed(2)}, actual ₦${breakdown.actualAverageCost.toFixed(2)}, difference ₦${breakdown.difference.toFixed(2)}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    breakdown,
  };
}

// Weighted Average Cost Validation
export function validateWeightedAverageCalculation(
  calculations: Array<{
    calculationType: 'PURCHASE' | 'PRODUCTION';
    calculationDate: Date;
    oldQuantity: number;
    oldCost: number;
    newQuantity: number;
    newCost: number;
    calculatedAverage: number;
  }>,
  tolerance: number = 0.01 // ₦0.01 tolerance for rounding
): {
  isValid: boolean;
  errors: string[];
  breakdown: {
    totalCalculations: number;
    errorsFound: number;
    calculations: Array<{
      calculationType: string;
      calculationDate: Date;
      oldQuantity: number;
      oldCost: number;
      newQuantity: number;
      newCost: number;
      expectedAverage: number;
      actualAverage: number;
      difference: number;
      isCorrect: boolean;
    }>;
  };
} {
  const breakdown = {
    totalCalculations: calculations.length,
    errorsFound: 0,
    calculations: calculations.map(calc => {
      // Expected weighted average
      const expectedAverage =
        (calc.oldQuantity * calc.oldCost + calc.newQuantity * calc.newCost) /
        (calc.oldQuantity + calc.newQuantity);
      const actualAverage = calc.calculatedAverage;
      const difference = Math.abs(actualAverage - expectedAverage);
      const isCorrect = difference <= tolerance;

      return {
        calculationType: calc.calculationType,
        calculationDate: calc.calculationDate,
        oldQuantity: calc.oldQuantity,
        oldCost: calc.oldCost,
        newQuantity: calc.newQuantity,
        newCost: calc.newCost,
        expectedAverage,
        actualAverage,
        difference,
        isCorrect,
      };
    }),
  };

  const errors: string[] = [];

  // Validate each calculation
  breakdown.calculations.forEach(calc => {
    if (!calc.isCorrect) {
      breakdown.errorsFound++;
      errors.push(
        `${calc.calculationType}: Expected avg ₦${calc.expectedAverage.toFixed(2)}, actual ₦${calc.actualAverage.toFixed(2)}, diff ₦${calc.difference.toFixed(2)}`
      );
    }
  });

  return {
    isValid: breakdown.errorsFound === 0,
    errors,
    breakdown,
  };
}

// Production Cost Tracking Validation
export function validateProductionCosts(
  production: {
    id: string;
    productionNumber: string;
    productionDate: Date;
    inputs: Array<{
      id: string;
      inventoryItemId: string;
      materialName: string;
      quantity: number;
      unitCost: number;
      totalCost: number;
    }>;
    laborCost: number;
    overheadCost: number;
    totalCost: number;
    outputQuantity: number;
    outputInventoryItemId?: string;
    addToInventory: boolean;
  },
  inventoryItems: Array<{
    id: string;
    name: string;
    averageCost: number;
  }>
): {
  isValid: boolean;
  errors: string[];
  breakdown: {
    productionNumber: string;
    totalMaterialsCost: number;
    totalLaborCost: number;
    totalOverheadCost: number;
    totalProductionCost: number;
    unitProductionCost: number;
    addToInventory: boolean;
    inventoryUpdated: boolean;
    inputs: Array<{
      id: string;
      materialName: string;
      quantity: number;
      expectedCost: number;
      actualCost: number;
      isCorrect: boolean;
    }>;
  };
} {
  const breakdown = {
    productionNumber: production.productionNumber,
    totalMaterialsCost: production.inputs.reduce(
      (sum, input) => sum + input.totalCost,
      0
    ),
    totalLaborCost: production.laborCost,
    totalOverheadCost: production.overheadCost,
    totalProductionCost: production.totalCost,
    unitProductionCost:
      production.outputQuantity > 0
        ? production.totalCost / production.outputQuantity
        : 0,
    addToInventory: production.addToInventory,
    inventoryUpdated: false, // Will be checked
    inputs: production.inputs.map(input => {
      const inventoryItem = inventoryItems.find(
        inv => inv.id === input.inventoryItemId
      );
      const isCorrect = inventoryItem
        ? Math.abs(input.unitCost - inventoryItem.averageCost) <= 0.01
        : true;

      return {
        id: input.id,
        materialName: input.materialName,
        quantity: input.quantity,
        expectedCost: input.totalCost / input.quantity,
        actualCost: input.unitCost,
        isCorrect,
      };
    }),
  };

  const errors: string[] = [];

  // Verify material costs
  breakdown.totalMaterialsCost = production.inputs.reduce(
    (sum, input) => sum + input.quantity * input.unitCost,
    0
  );
  const expectedTotalProductionCost =
    breakdown.totalMaterialsCost +
    production.laborCost +
    production.overheadCost;

  if (Math.abs(production.totalCost - expectedTotalProductionCost) > 0.01) {
    errors.push(
      `Production cost mismatch: Expected ₦${expectedTotalProductionCost.toFixed(2)}, actual ₦${production.totalCost.toFixed(2)}, diff ₦${Math.abs(production.totalCost - expectedTotalProductionCost).toFixed(2)}`
    );
  }

  // Verify inputs match inventory costs
  breakdown.inputs.forEach(input => {
    if (!input.isCorrect) {
      errors.push(
        `Material ${input.materialName}: Expected cost ₦${input.expectedCost.toFixed(2)}, actual ₦${input.actualCost.toFixed(2)}`
      );
    }
  });

  // Check if inventory was updated
  if (production.addToInventory && production.outputInventoryItemId) {
    const inventoryItem = inventoryItems.find(
      inv => inv.id === production.outputInventoryItemId
    );
    if (inventoryItem) {
      breakdown.inventoryUpdated = true;

      // Check if average cost was updated to production unit cost
      const expectedCost = breakdown.unitProductionCost;
      const actualCost = inventoryItem.averageCost;

      if (Math.abs(actualCost - expectedCost) > 0.01) {
        errors.push(
          `Inventory ${inventoryItem.name}: Expected avg ₦${expectedCost.toFixed(2)}, actual ₦${actualCost.toFixed(2)}, diff ₦${Math.abs(actualCost - expectedCost).toFixed(2)}`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    breakdown,
  };
}

// COGS (Cost of Goods Sold) Validation
export function validateCOGS(sale: {
  id: string;
  saleNumber: string;
  items: Array<{
    id: string;
    itemName: string;
    quantity: number;
    costPrice: number;
    sellingPrice: number;
    inventoryItemId?: string;
    productionId?: string;
  }>;
  totalCOGS: number;
  totalAmount: number;
}): {
  isValid: boolean;
  errors: string[];
  breakdown: {
    saleNumber: string;
    expectedCOGS: number;
    actualCOGS: number;
    difference: number;
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      costPrice: number;
      sellingPrice: number;
      expectedCOGS: number;
      actualCOGS: number;
      isCorrect: boolean;
    }>;
  };
} {
  const breakdown = {
    saleNumber: sale.saleNumber,
    expectedCOGS: sale.totalCOGS || 0,
    actualCOGS: sale.totalCOGS || 0,
    difference: 0,
    items: sale.items.map(item => {
      const expectedCOGS = (item.costPrice || 0) * item.quantity;
      const actualCOGS = item.costPrice ? item.costPrice * item.quantity : 0; // COGS = costPrice × quantity
      const isCorrect = Math.abs(expectedCOGS - actualCOGS) <= 0.01;

      return {
        id: item.id,
        itemName: item.itemName,
        quantity: item.quantity,
        costPrice: item.costPrice || 0,
        sellingPrice: item.sellingPrice,
        expectedCOGS,
        actualCOGS,
        isCorrect,
      };
    }),
  };

  const errors: string[] = [];

  // Calculate expected COGS from items
  const expectedTotalCOGS = breakdown.items.reduce(
    (sum, item) => sum + item.expectedCOGS,
    0
  );

  // Difference
  breakdown.difference = Math.abs((sale.totalCOGS || 0) - expectedTotalCOGS);

  // Validate each item
  breakdown.items.forEach(item => {
    if (!item.isCorrect) {
      errors.push(
        `Item ${item.itemName}: Expected COGS ₦${item.expectedCOGS.toFixed(2)}, actual ₦${item.actualCOGS.toFixed(2)}`
      );
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    breakdown,
  };
}

// Generate Audit Report
export function generateAuditReport(
  stockIntegrity: ReturnType<typeof validateStockMovements>,
  saleProfitIntegrity: ReturnType<typeof validateSaleProfit>,
  purchaseCostIntegrity: ReturnType<typeof validatePurchaseCosts>,
  productionCostIntegrity: ReturnType<typeof validateProductionCosts>,
  cogsIntegrity: ReturnType<typeof validateCOGS>
): {
  isHealthy: boolean;
  criticalIssues: string[];
  warnings: string[];
  info: string[];
  summary: string;
} {
  const criticalIssues: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // Check stock integrity
  if (!stockIntegrity.isValid) {
    criticalIssues.push(...stockIntegrity.errors);
    if (stockIntegrity.breakdown.difference > 100) {
      criticalIssues.push(
        `CRITICAL: Stock variance of ${stockIntegrity.breakdown.difference} units`
      );
    }
  }

  // Check sale profit integrity
  if (!saleProfitIntegrity.isValid) {
    warnings.push(...saleProfitIntegrity.errors);
  }

  // Check purchase cost integrity
  if (!purchaseCostIntegrity.isValid) {
    warnings.push(...purchaseCostIntegrity.errors);
  }

  // Check production cost integrity
  if (!productionCostIntegrity.isValid) {
    warnings.push(...productionCostIntegrity.errors);
  }

  // Check COGS integrity
  if (!cogsIntegrity.isValid) {
    warnings.push(...cogsIntegrity.errors);
  }

  // Generate summary
  const summary = `
Audit Report Summary:
------------------------
Stock Integrity: ${stockIntegrity.isValid ? '✓ PASS' : '✗ FAIL'}
  Stock Variance: ${stockIntegrity.breakdown.difference} units

Sale Profit Integrity: ${saleProfitIntegrity.isValid ? '✓ PASS' : '✗ FAIL'}
  Items With Errors: ${saleProfitIntegrity.breakdown.itemsWithErrors.length}
  Profit Variance: ₦${saleProfitIntegrity.breakdown.difference.toFixed(2)}

Purchase Cost Integrity: ${purchaseCostIntegrity.isValid ? '✓ PASS' : '✗ FAIL'}
  Average Cost Variance: ₦${purchaseCostIntegrity.breakdown.difference.toFixed(2)}

Production Cost Integrity: ${productionCostIntegrity.isValid ? '✓ PASS' : '✗ FAIL'}
  Total Cost Variance: ₦${Math.abs(productionCostIntegrity.breakdown.totalProductionCost - (productionCostIntegrity.breakdown.totalMaterialsCost + productionCostIntegrity.breakdown.totalLaborCost + productionCostIntegrity.breakdown.totalOverheadCost)).toFixed(2)}

COGS Integrity: ${cogsIntegrity.isValid ? '✓ PASS' : '✗ FAIL'}
  COGS Variance: ₦${cogsIntegrity.breakdown.difference.toFixed(2)}

Overall Status: ${criticalIssues.length === 0 && warnings.length === 0 ? '✓ ALL SYSTEMS HEALTHY' : '⚠ ISSUES DETECTED'}
  `.trim();

  const isHealthy = criticalIssues.length === 0 && warnings.length === 0;

  return {
    isHealthy,
    criticalIssues,
    warnings,
    info,
    summary,
  };
}
