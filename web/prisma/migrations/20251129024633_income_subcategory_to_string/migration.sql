/*
  Warnings:

  - The values [GAINS] on the enum `IncomeMainCategory` will be removed. If these variants are still used in the database, this will fail.
  - The values [CAPITAL_GAINS,DIGITAL_ASSET_GAINS,SECURITIES_GAINS] on the enum `IncomeSubCategory` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `digitalAssetId` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `fixedAssetId` on the `IncomeRecord` table. All the data in the column will be lost.
  - You are about to drop the column `securityId` on the `IncomeRecord` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "IncomeMainCategory_new" AS ENUM ('BUSINESS_PROFIT', 'EMPLOYMENT_INCOME', 'TRUST_ESTATE_INCOME', 'OTHER_INCOME');
ALTER TABLE "IncomeRecord" ALTER COLUMN "mainCategory" TYPE "IncomeMainCategory_new" USING ("mainCategory"::text::"IncomeMainCategory_new");
ALTER TYPE "IncomeMainCategory" RENAME TO "IncomeMainCategory_old";
ALTER TYPE "IncomeMainCategory_new" RENAME TO "IncomeMainCategory";
DROP TYPE "public"."IncomeMainCategory_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "IncomeSubCategory_new" AS ENUM ('TRADE_PROFIT', 'SERVICE_FEES', 'COMMISSION', 'ROYALTIES', 'RENTAL_INCOME', 'INTEREST_INCOME', 'DIVIDENDS', 'PRIZES_AWARDS', 'REBATES_DISCOUNTS', 'OTHER_BUSINESS_INCOME', 'SALARY', 'BONUS', 'ALLOWANCES', 'BENEFITS_IN_KIND', 'PENSION', 'SEVERANCE', 'TRUST_DISTRIBUTION', 'ESTATE_DISTRIBUTION', 'GIFTS_RECEIVED', 'DONATIONS_RECEIVED', 'GRANTS', 'COMPENSATION', 'INSURANCE_PROCEEDS', 'INHERITANCE', 'LOAN_FORGIVENESS', 'WINDFALL', 'CUSTOM');
ALTER TABLE "IncomeRecord" ALTER COLUMN "subCategory" TYPE "IncomeSubCategory_new" USING ("subCategory"::text::"IncomeSubCategory_new");
ALTER TYPE "IncomeSubCategory" RENAME TO "IncomeSubCategory_old";
ALTER TYPE "IncomeSubCategory_new" RENAME TO "IncomeSubCategory";
DROP TYPE "public"."IncomeSubCategory_old";
COMMIT;

-- AlterEnum
ALTER TYPE "PayableType" ADD VALUE 'OTHER_INCOME';

-- DropForeignKey
ALTER TABLE "public"."IncomeRecord" DROP CONSTRAINT "IncomeRecord_digitalAssetId_fkey";

-- DropForeignKey
ALTER TABLE "public"."IncomeRecord" DROP CONSTRAINT "IncomeRecord_fixedAssetId_fkey";

-- DropForeignKey
ALTER TABLE "public"."IncomeRecord" DROP CONSTRAINT "IncomeRecord_securityId_fkey";

-- DropIndex
DROP INDEX "public"."IncomeRecord_userId_digitalAssetId_idx";

-- DropIndex
DROP INDEX "public"."IncomeRecord_userId_fixedAssetId_idx";

-- DropIndex
DROP INDEX "public"."IncomeRecord_userId_securityId_idx";

-- AlterTable
ALTER TABLE "IncomeRecord" DROP COLUMN "digitalAssetId",
DROP COLUMN "fixedAssetId",
DROP COLUMN "securityId",
ADD COLUMN     "customSubCategory" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "incomeId" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "IncomeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
