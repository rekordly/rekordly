/*
  Warnings:

  - The values [FUEL,MARKETING,INTEREST_PAID,PERSONAL_EXPENSE] on the enum `ExpenseCategory` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `taxCategory` on the `Expense` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ExpenseCategory_new" AS ENUM ('COST_OF_GOODS', 'RENT_RATES', 'UTILITIES', 'SALARIES_WAGES', 'REPAIRS_MAINTENANCE', 'OFFICE_SUPPLIES', 'SOFTWARE_SUBSCRIPTIONS', 'PROFESSIONAL_FEES', 'INSURANCE', 'LICENSES_PERMITS', 'ADVERTISING', 'BANK_CHARGES', 'TRAINING', 'INTEREST_ON_DEBT', 'BAD_DEBTS', 'DONATIONS', 'DEPRECIATION', 'RESEARCH_DEVELOPMENT', 'ENTERTAINMENT', 'PERSONAL_EXPENSES', 'RESIDENTIAL_RENT', 'TRANSPORTATION', 'FINES_PENALTIES', 'BENEFITS_IN_KIND', 'NON_APPROVED_PENSION', 'PERSONAL_LIVING_EXPENSES', 'OTHER');
ALTER TABLE "Expense" ALTER COLUMN "category" TYPE "ExpenseCategory_new" USING ("category"::text::"ExpenseCategory_new");
ALTER TYPE "ExpenseCategory" RENAME TO "ExpenseCategory_old";
ALTER TYPE "ExpenseCategory_new" RENAME TO "ExpenseCategory";
DROP TYPE "public"."ExpenseCategory_old";
COMMIT;

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "taxCategory",
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "IncomeRecord" ADD COLUMN     "taxablePercentage" DOUBLE PRECISION;

-- DropEnum
DROP TYPE "public"."ExpenseTaxCategory";
