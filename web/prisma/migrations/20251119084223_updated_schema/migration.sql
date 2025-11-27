/*
  Warnings:

  - You are about to drop the column `originalExpenseId` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `vendor` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `assetId` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `employer` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `originalRecordId` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `saleId` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `sourceId` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `sourceType` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `taxableAmount` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `vatAmount` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `withholdingTax` on the `IncomeRecord` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,email,customerRole]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CustomerRole" AS ENUM ('BUYER', 'SUPPLIER');

-- AlterEnum
ALTER TYPE "IncomeMainCategory" ADD VALUE 'GAINS';

-- DropForeignKey
ALTER TABLE "public"."IncomeRecord" DROP CONSTRAINT "IncomeRecord_saleId_fkey";

-- DropIndex
DROP INDEX "public"."Customer_userId_email_key";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "customerRole" "CustomerRole" NOT NULL DEFAULT 'BUYER';

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "originalExpenseId",
DROP COLUMN "vendor",
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "vendorName" TEXT;

-- AlterTable
ALTER TABLE "IncomeRecord" DROP COLUMN "assetId",
DROP COLUMN "employer",
DROP COLUMN "originalRecordId",
DROP COLUMN "saleId",
DROP COLUMN "sourceId",
DROP COLUMN "sourceType",
DROP COLUMN "taxableAmount",
DROP COLUMN "vatAmount",
DROP COLUMN "withholdingTax",
ADD COLUMN     "digitalAssetId" TEXT,
ADD COLUMN     "fixedAssetId" TEXT,
ADD COLUMN     "securityId" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "customerId" TEXT;

-- DropEnum
DROP TYPE "public"."IncomeSourceType";

-- CreateIndex
CREATE INDEX "Customer_userId_customerRole_idx" ON "Customer"("userId", "customerRole");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_email_customerRole_key" ON "Customer"("userId", "email", "customerRole");

-- CreateIndex
CREATE INDEX "Expense_userId_customerId_idx" ON "Expense"("userId", "customerId");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_fixedAssetId_idx" ON "IncomeRecord"("userId", "fixedAssetId");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_digitalAssetId_idx" ON "IncomeRecord"("userId", "digitalAssetId");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_securityId_idx" ON "IncomeRecord"("userId", "securityId");

-- CreateIndex
CREATE INDEX "Purchase_userId_customerId_idx" ON "Purchase"("userId", "customerId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_digitalAssetId_fkey" FOREIGN KEY ("digitalAssetId") REFERENCES "DigitalAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
