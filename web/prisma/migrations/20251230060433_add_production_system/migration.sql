/*
  Warnings:

  - The values [MADE_TO_ORDER] on the enum `InventoryType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `storefrontOrder` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the column `addToInventory` on the `Production` table. All the data in the column will be lost.
  - Made the column `outputInventoryItemId` on table `Production` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InventoryType_new" AS ENUM ('RAW_MATERIAL', 'FINISHED_GOOD', 'PRODUCED_ITEM', 'SERVICE', 'CONSUMABLE');
ALTER TABLE "InventoryItem" ALTER COLUMN "itemType" TYPE "InventoryType_new" USING ("itemType"::text::"InventoryType_new");
ALTER TYPE "InventoryType" RENAME TO "InventoryType_old";
ALTER TYPE "InventoryType_new" RENAME TO "InventoryType";
DROP TYPE "public"."InventoryType_old";
COMMIT;

-- AlterTable
ALTER TABLE "InventoryItem" DROP COLUMN "storefrontOrder";

-- AlterTable
ALTER TABLE "Production" DROP COLUMN "addToInventory",
ADD COLUMN     "batchMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "outputImage" TEXT,
ADD COLUMN     "recipeId" TEXT,
ALTER COLUMN "outputInventoryItemId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ProductionInput" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "StockAdjustment" ADD COLUMN     "sourceProductionId" TEXT;

-- CreateTable
CREATE TABLE "ProductRecipe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "outputInventoryItemId" TEXT NOT NULL,
    "outputQuantity" DOUBLE PRECISION NOT NULL,
    "defaultLaborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultOverheadCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recipeImage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipe_outputInventoryItemId_key" ON "ProductRecipe"("outputInventoryItemId");

-- CreateIndex
CREATE INDEX "ProductRecipe_userId_isActive_idx" ON "ProductRecipe"("userId", "isActive");

-- CreateIndex
CREATE INDEX "ProductRecipe_userId_name_idx" ON "ProductRecipe"("userId", "name");

-- CreateIndex
CREATE INDEX "ProductRecipe_userId_category_idx" ON "ProductRecipe"("userId", "category");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_inventoryItemId_idx" ON "RecipeIngredient"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_inventoryItemId_key" ON "RecipeIngredient"("recipeId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "Production_recipeId_idx" ON "Production"("recipeId");

-- CreateIndex
CREATE INDEX "Production_outputInventoryItemId_idx" ON "Production"("outputInventoryItemId");

-- CreateIndex
CREATE INDEX "Production_productionNumber_idx" ON "Production"("productionNumber");

-- CreateIndex
CREATE INDEX "StockAdjustment_adjustmentType_idx" ON "StockAdjustment"("adjustmentType");

-- CreateIndex
CREATE INDEX "StockAdjustment_sourceProductionId_idx" ON "StockAdjustment"("sourceProductionId");

-- AddForeignKey
ALTER TABLE "ProductRecipe" ADD CONSTRAINT "ProductRecipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipe" ADD CONSTRAINT "ProductRecipe_outputInventoryItemId_fkey" FOREIGN KEY ("outputInventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "ProductRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "ProductRecipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_outputInventoryItemId_fkey" FOREIGN KEY ("outputInventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
