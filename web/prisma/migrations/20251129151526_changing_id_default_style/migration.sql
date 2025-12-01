/*
  Warnings:

  - The values [WINDFALL] on the enum `IncomeSubCategory` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `purchaseId` on the `Expense` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "IncomeSubCategory_new" AS ENUM ('TRADE_PROFIT', 'SERVICE_FEES', 'COMMISSION', 'ROYALTIES', 'RENTAL_INCOME', 'INTEREST_INCOME', 'DIVIDENDS', 'PRIZES_AWARDS', 'REBATES_DISCOUNTS', 'OTHER_BUSINESS_INCOME', 'SALARY', 'BONUS', 'ALLOWANCES', 'BENEFITS_IN_KIND', 'PENSION', 'SEVERANCE', 'TRUST_DISTRIBUTION', 'ESTATE_DISTRIBUTION', 'GIFTS_RECEIVED', 'DONATIONS_RECEIVED', 'GRANTS', 'COMPENSATION', 'INSURANCE_PROCEEDS', 'INHERITANCE', 'LOAN_FORGIVENESS', 'LOANS', 'CUSTOM');
ALTER TABLE "IncomeRecord" ALTER COLUMN "subCategory" TYPE "IncomeSubCategory_new" USING ("subCategory"::text::"IncomeSubCategory_new");
ALTER TYPE "IncomeSubCategory" RENAME TO "IncomeSubCategory_old";
ALTER TYPE "IncomeSubCategory_new" RENAME TO "IncomeSubCategory";
DROP TYPE "public"."IncomeSubCategory_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."Expense" DROP CONSTRAINT "Expense_purchaseId_fkey";

-- DropIndex
DROP INDEX "public"."Expense_purchaseId_key";

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "purchaseId",
ADD COLUMN     "returnDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IncomeRecord" ADD COLUMN     "refundDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "expensesId" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_expensesId_fkey" FOREIGN KEY ("expensesId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
