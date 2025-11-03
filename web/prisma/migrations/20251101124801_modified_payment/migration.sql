/*
  Warnings:

  - The values [PAID] on the enum `InvoiceStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `workType` on the `OnboardingData` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `Sale` table. All the data in the column will be lost.
  - Added the required column `category` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payableType` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sourceType` to the `Sale` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotal` to the `Sale` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "SaleSourceType" AS ENUM ('DIRECT', 'FROM_INVOICE');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PayableType" AS ENUM ('QUOTATION', 'SALE', 'PURCHASE');

-- CreateEnum
CREATE TYPE "PaymentCategory" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "IncomeMainCategory" AS ENUM ('BUSINESS_PROFIT', 'EMPLOYMENT_INCOME', 'TRUST_ESTATE_INCOME');

-- CreateEnum
CREATE TYPE "IncomeSubCategory" AS ENUM ('TRADE_PROFIT', 'SERVICE_FEES', 'COMMISSION', 'ROYALTIES', 'RENTAL_INCOME', 'INTEREST_INCOME', 'DIVIDENDS', 'CAPITAL_GAINS', 'DIGITAL_ASSET_GAINS', 'SECURITIES_GAINS', 'PRIZES_AWARDS', 'REBATES_DISCOUNTS', 'OTHER_BUSINESS_INCOME', 'SALARY', 'BONUS', 'ALLOWANCES', 'BENEFITS_IN_KIND', 'PENSION', 'SEVERANCE', 'TRUST_DISTRIBUTION', 'ESTATE_DISTRIBUTION');

-- CreateEnum
CREATE TYPE "IncomeSourceType" AS ENUM ('SALE_PAYMENT', 'QUOTATION_PAYMENT', 'DIRECT_ENTRY', 'ASSET_DISPOSAL', 'SECURITY_TRADE', 'EMPLOYMENT', 'PASSIVE');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('COST_OF_GOODS', 'RENT_RATES', 'UTILITIES', 'SALARIES_WAGES', 'TRANSPORTATION', 'FUEL', 'REPAIRS_MAINTENANCE', 'OFFICE_SUPPLIES', 'SOFTWARE_SUBSCRIPTIONS', 'PROFESSIONAL_FEES', 'INSURANCE', 'LICENSES_PERMITS', 'ADVERTISING', 'MARKETING', 'BANK_CHARGES', 'INTEREST_PAID', 'DONATIONS', 'TRAINING', 'DEPRECIATION', 'PERSONAL_EXPENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseTaxCategory" AS ENUM ('RENT_AND_PREMISES', 'EMPLOYEE_COSTS', 'REPAIRS_MAINTENANCE', 'INTEREST_ON_DEBT', 'BAD_DEBTS', 'RESEARCH_DEVELOPMENT', 'DONATIONS_DEDUCTIBLE', 'CAPITAL_EXPENDITURE', 'PERSONAL_EXPENSE', 'FINES_PENALTIES', 'NON_APPROVED_PENSION', 'ENTERTAINMENT');

-- CreateEnum
CREATE TYPE "FixedAssetCategory" AS ENUM ('LAND', 'BUILDING', 'VEHICLE', 'MACHINERY', 'EQUIPMENT', 'FURNITURE', 'COMPUTER', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'DISPOSED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "DigitalAssetType" AS ENUM ('CRYPTOCURRENCY', 'NFT', 'DOMAIN_NAME', 'DIGITAL_ART', 'GAME_ASSET', 'OTHER');

-- CreateEnum
CREATE TYPE "SecurityType" AS ENUM ('STOCK', 'BOND', 'MUTUAL_FUND', 'ETF', 'TREASURY_BILL', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "InvoiceStatus_new" AS ENUM ('DRAFT', 'SENT', 'CONVERTED', 'OVERDUE', 'CANCELLED');
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::text::"InvoiceStatus_new");
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "public"."InvoiceStatus_old";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum
ALTER TYPE "SaleStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- DropIndex
DROP INDEX "public"."Payment_saleId_idx";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "convertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OnboardingData" DROP COLUMN "workType",
ADD COLUMN     "workTypes" TEXT[];

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "category" "PaymentCategory" NOT NULL,
ADD COLUMN     "payableType" "PayableType" NOT NULL,
ADD COLUMN     "purchaseId" TEXT,
ADD COLUMN     "quotationId" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "saleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "amount",
ADD COLUMN     "deliveryCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValue" DOUBLE PRECISION,
ADD COLUMN     "otherSaleExpenses" JSONB,
ADD COLUMN     "refundAmount" DOUBLE PRECISION,
ADD COLUMN     "refundDate" TIMESTAMP(3),
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "sourceType" "SaleSourceType" NOT NULL,
ADD COLUMN     "subtotal" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "totalSaleExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "title" TEXT,
    "description" TEXT,
    "materials" JSONB,
    "materialsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workmanship" JSONB,
    "workmanshipTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCosts" JSONB,
    "otherCostsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "includeVAT" BOOLEAN NOT NULL DEFAULT false,
    "vatAmount" DOUBLE PRECISION,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundReason" TEXT,
    "refundDate" TIMESTAMP(3),
    "refundAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "purchaseNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorEmail" TEXT,
    "vendorPhone" TEXT,
    "title" TEXT,
    "description" TEXT,
    "items" JSONB NOT NULL,
    "otherCosts" JSONB,
    "otherCostsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "includeVAT" BOOLEAN NOT NULL DEFAULT false,
    "vatAmount" DOUBLE PRECISION,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'UNPAID',
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundReason" TEXT,
    "refundDate" TIMESTAMP(3),
    "refundAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mainCategory" "IncomeMainCategory" NOT NULL,
    "subCategory" "IncomeSubCategory" NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "taxableAmount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" "IncomeSourceType",
    "sourceId" TEXT,
    "saleId" TEXT,
    "employer" TEXT,
    "assetId" TEXT,
    "withholdingTax" DOUBLE PRECISION DEFAULT 0,
    "vatAmount" DOUBLE PRECISION DEFAULT 0,
    "isRefund" BOOLEAN NOT NULL DEFAULT false,
    "refundReason" TEXT,
    "originalRecordId" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "subCategory" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeductible" BOOLEAN NOT NULL DEFAULT true,
    "deductionPercentage" INTEGER NOT NULL DEFAULT 100,
    "taxCategory" "ExpenseTaxCategory",
    "purchaseId" TEXT,
    "isReturn" BOOLEAN NOT NULL DEFAULT false,
    "returnReason" TEXT,
    "originalExpenseId" TEXT,
    "receipt" TEXT,
    "attachments" JSONB,
    "vendor" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FixedAssetCategory" NOT NULL,
    "acquisitionCost" DOUBLE PRECISION NOT NULL,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "depreciationRate" DOUBLE PRECISION,
    "residualValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valueHistory" JSONB,
    "disposalDate" TIMESTAMP(3),
    "disposalProceeds" DOUBLE PRECISION,
    "capitalGain" DOUBLE PRECISION,
    "description" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "DigitalAssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "averageCost" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "transactions" JSONB[],
    "totalGains" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLosses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Security" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SecurityType" NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "averageCost" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "transactions" JSONB[],
    "dividendsReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGains" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLosses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Security_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quotationNumber_key" ON "Quotation"("quotationNumber");

-- CreateIndex
CREATE INDEX "Quotation_userId_idx" ON "Quotation"("userId");

-- CreateIndex
CREATE INDEX "Quotation_userId_status_idx" ON "Quotation"("userId", "status");

-- CreateIndex
CREATE INDEX "Quotation_userId_issueDate_idx" ON "Quotation"("userId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_purchaseNumber_key" ON "Purchase"("purchaseNumber");

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");

-- CreateIndex
CREATE INDEX "Purchase_userId_status_idx" ON "Purchase"("userId", "status");

-- CreateIndex
CREATE INDEX "Purchase_userId_purchaseDate_idx" ON "Purchase"("userId", "purchaseDate");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_mainCategory_idx" ON "IncomeRecord"("userId", "mainCategory");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_date_idx" ON "IncomeRecord"("userId", "date");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_subCategory_idx" ON "IncomeRecord"("userId", "subCategory");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_mainCategory_date_idx" ON "IncomeRecord"("userId", "mainCategory", "date");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_isRefund_idx" ON "IncomeRecord"("userId", "isRefund");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_purchaseId_key" ON "Expense"("purchaseId");

-- CreateIndex
CREATE INDEX "Expense_userId_category_idx" ON "Expense"("userId", "category");

-- CreateIndex
CREATE INDEX "Expense_userId_date_idx" ON "Expense"("userId", "date");

-- CreateIndex
CREATE INDEX "Expense_userId_isDeductible_idx" ON "Expense"("userId", "isDeductible");

-- CreateIndex
CREATE INDEX "Expense_userId_category_date_idx" ON "Expense"("userId", "category", "date");

-- CreateIndex
CREATE INDEX "Expense_userId_isReturn_idx" ON "Expense"("userId", "isReturn");

-- CreateIndex
CREATE INDEX "FixedAsset_userId_status_idx" ON "FixedAsset"("userId", "status");

-- CreateIndex
CREATE INDEX "FixedAsset_userId_category_idx" ON "FixedAsset"("userId", "category");

-- CreateIndex
CREATE INDEX "FixedAsset_userId_acquisitionDate_idx" ON "FixedAsset"("userId", "acquisitionDate");

-- CreateIndex
CREATE INDEX "DigitalAsset_userId_type_idx" ON "DigitalAsset"("userId", "type");

-- CreateIndex
CREATE INDEX "DigitalAsset_userId_status_idx" ON "DigitalAsset"("userId", "status");

-- CreateIndex
CREATE INDEX "Security_userId_type_idx" ON "Security"("userId", "type");

-- CreateIndex
CREATE INDEX "Security_userId_status_idx" ON "Security"("userId", "status");

-- CreateIndex
CREATE INDEX "Invoice_userId_issueDate_idx" ON "Invoice"("userId", "issueDate");

-- CreateIndex
CREATE INDEX "Payment_userId_payableType_idx" ON "Payment"("userId", "payableType");

-- CreateIndex
CREATE INDEX "Payment_userId_saleId_idx" ON "Payment"("userId", "saleId");

-- CreateIndex
CREATE INDEX "Payment_userId_quotationId_idx" ON "Payment"("userId", "quotationId");

-- CreateIndex
CREATE INDEX "Payment_userId_purchaseId_idx" ON "Payment"("userId", "purchaseId");

-- CreateIndex
CREATE INDEX "Payment_userId_paymentDate_idx" ON "Payment"("userId", "paymentDate");

-- CreateIndex
CREATE INDEX "Sale_userId_saleDate_idx" ON "Sale"("userId", "saleDate");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalAsset" ADD CONSTRAINT "DigitalAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Security" ADD CONSTRAINT "Security_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
