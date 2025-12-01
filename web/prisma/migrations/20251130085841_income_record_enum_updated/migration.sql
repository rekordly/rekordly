/*
  Warnings:

  - The values [LOANS] on the enum `IncomeSubCategory` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncomeMainCategory" ADD VALUE 'INVESTMENT_INCOME';
ALTER TYPE "IncomeMainCategory" ADD VALUE 'PROPERTY_INCOME';
ALTER TYPE "IncomeMainCategory" ADD VALUE 'DIGITAL_ASSETS';
ALTER TYPE "IncomeMainCategory" ADD VALUE 'EXEMPT_INCOME';

-- AlterEnum
BEGIN;
CREATE TYPE "IncomeSubCategory_new" AS ENUM ('TRADE_PROFIT', 'SERVICE_FEES', 'COMMISSION', 'ROYALTIES', 'RENTAL_INCOME', 'INTEREST_INCOME', 'DIVIDENDS', 'PRIZES_AWARDS', 'REBATES_DISCOUNTS', 'OTHER_BUSINESS_INCOME', 'SALARY', 'BONUS', 'ALLOWANCES', 'BENEFITS_IN_KIND', 'PENSION', 'SEVERANCE', 'INVESTMENT_RETURN', 'CAPITAL_GAINS', 'STOCK_OPTIONS', 'MUTUAL_FUNDS', 'BONDS', 'PROPERTY_RENTAL', 'PROPERTY_LEASING', 'PROPERTY_DISPOSAL', 'CRYPTOCURRENCY_TRADING', 'DIGITAL_ASSET_MINING', 'NFT_SALES', 'DIGITAL_SERVICES', 'TRUST_DISTRIBUTION', 'ESTATE_DISTRIBUTION', 'GIFTS_RECEIVED', 'DONATIONS_RECEIVED', 'GRANTS', 'COMPENSATION', 'INSURANCE_PROCEEDS', 'INHERITANCE', 'LOAN_FORGIVENESS', 'CUSTOM', 'RETURN_OF_CAPITAL', 'LOAN_RECEIVED', 'SPECIFIC_EXEMPTIONS');
ALTER TABLE "IncomeRecord" ALTER COLUMN "subCategory" TYPE "IncomeSubCategory_new" USING ("subCategory"::text::"IncomeSubCategory_new");
ALTER TYPE "IncomeSubCategory" RENAME TO "IncomeSubCategory_old";
ALTER TYPE "IncomeSubCategory_new" RENAME TO "IncomeSubCategory";
DROP TYPE "public"."IncomeSubCategory_old";
COMMIT;
