-- CreateEnum
CREATE TYPE "IncomeRecordStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "IncomeRecord" ADD COLUMN     "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "status" "IncomeRecordStatus" NOT NULL DEFAULT 'UNPAID';

-- CreateIndex
CREATE INDEX "Expense_userId_status_idx" ON "Expense"("userId", "status");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_status_idx" ON "IncomeRecord"("userId", "status");

-- CreateIndex
CREATE INDEX "Payment_userId_incomeId_idx" ON "Payment"("userId", "incomeId");

-- CreateIndex
CREATE INDEX "Payment_userId_expensesId_idx" ON "Payment"("userId", "expensesId");
