/*
  Warnings:

  - You are about to drop the column `materials` on the `Quotation` table. All the data in the column will be lost.
  - You are about to drop the column `materialsTotal` on the `Quotation` table. All the data in the column will be lost.
  - You are about to drop the column `otherCosts` on the `Quotation` table. All the data in the column will be lost.
  - You are about to drop the column `otherCostsTotal` on the `Quotation` table. All the data in the column will be lost.
  - You are about to drop the column `workmanship` on the `Quotation` table. All the data in the column will be lost.
  - You are about to drop the column `items` on the `Sale` table. All the data in the column will be lost.
  - Added the required column `purchaseType` to the `Purchase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lineItems` to the `Quotation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotal` to the `Quotation` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InventoryType" AS ENUM ('RAW_MATERIAL', 'FINISHED_GOOD', 'SERVICE', 'MADE_TO_ORDER', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('RESTOCK', 'SALE', 'DAMAGE', 'RETURN', 'CORRECTION', 'PRODUCTION', 'THEFT', 'FOUND', 'EXPIRED', 'USED', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('INVENTORY_RESTOCK', 'BUSINESS_EXPENSE', 'ASSET_PURCHASE', 'PERSONAL_EXPENSE');

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "purchaseType" "PurchaseType" NOT NULL,
ADD COLUMN     "sourceQuotationId" TEXT;

-- AlterTable
ALTER TABLE "Quotation" DROP COLUMN "materials",
DROP COLUMN "materialsTotal",
DROP COLUMN "otherCosts",
DROP COLUMN "otherCostsTotal",
DROP COLUMN "workmanship",
ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValue" DOUBLE PRECISION,
ADD COLUMN     "lineItems" JSONB NOT NULL,
ADD COLUMN     "subtotal" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "items";

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemType" "InventoryType" NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "quantityOnHand" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderLevel" DOUBLE PRECISION,
    "reorderQuantity" DOUBLE PRECISION,
    "averageCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastPurchaseCost" DOUBLE PRECISION,
    "sellingPrice" DOUBLE PRECISION,
    "showOnStorefront" BOOLEAN NOT NULL DEFAULT false,
    "storefrontImage" TEXT,
    "storefrontOrder" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "adjustmentType" "AdjustmentType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "oldQuantity" DOUBLE PRECISION NOT NULL,
    "newQuantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "totalCost" DOUBLE PRECISION,
    "sourcePurchaseId" TEXT,
    "adjustmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Production" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productionNumber" TEXT NOT NULL,
    "saleId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "productionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outputItemName" TEXT NOT NULL,
    "outputQuantity" DOUBLE PRECISION NOT NULL,
    "outputSellingPrice" DOUBLE PRECISION,
    "addToInventory" BOOLEAN NOT NULL DEFAULT false,
    "outputInventoryItemId" TEXT,
    "materialsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overheadCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ProductionStatus" NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionInput" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProductionInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "productionId" TEXT,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profit" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryItem_userId_itemType_idx" ON "InventoryItem"("userId", "itemType");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_isActive_idx" ON "InventoryItem"("userId", "isActive");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_name_idx" ON "InventoryItem"("userId", "name");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_showOnStorefront_idx" ON "InventoryItem"("userId", "showOnStorefront");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_userId_sku_key" ON "InventoryItem"("userId", "sku");

-- CreateIndex
CREATE INDEX "StockAdjustment_userId_inventoryItemId_idx" ON "StockAdjustment"("userId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "StockAdjustment_userId_adjustmentDate_idx" ON "StockAdjustment"("userId", "adjustmentDate");

-- CreateIndex
CREATE UNIQUE INDEX "Production_productionNumber_key" ON "Production"("productionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Production_saleId_key" ON "Production"("saleId");

-- CreateIndex
CREATE INDEX "Production_userId_productionDate_idx" ON "Production"("userId", "productionDate");

-- CreateIndex
CREATE INDEX "Production_userId_status_idx" ON "Production"("userId", "status");

-- CreateIndex
CREATE INDEX "Production_saleId_idx" ON "Production"("saleId");

-- CreateIndex
CREATE INDEX "ProductionInput_productionId_idx" ON "ProductionInput"("productionId");

-- CreateIndex
CREATE INDEX "ProductionInput_inventoryItemId_idx" ON "ProductionInput"("inventoryItemId");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_inventoryItemId_idx" ON "SaleItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "SaleItem_productionId_idx" ON "SaleItem"("productionId");

-- CreateIndex
CREATE INDEX "Purchase_userId_purchaseType_idx" ON "Purchase"("userId", "purchaseType");

-- CreateIndex
CREATE INDEX "Purchase_sourceQuotationId_idx" ON "Purchase"("sourceQuotationId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionInput" ADD CONSTRAINT "ProductionInput_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionInput" ADD CONSTRAINT "ProductionInput_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_sourceQuotationId_fkey" FOREIGN KEY ("sourceQuotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
