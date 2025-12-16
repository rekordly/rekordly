/*
  Warnings:

  - The values [LOAN_FORGIVENESS,LOAN_RECEIVED] on the enum `IncomeSubCategory` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'DEFAULTED', 'RESTRUCTURED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "EquityType" AS ENUM ('CAPITAL_INJECTION', 'OWNER_DRAWING', 'DIVIDEND');

-- AlterEnum
BEGIN;
CREATE TYPE "IncomeSubCategory_new" AS ENUM ('TRADE_PROFIT', 'SERVICE_FEES', 'COMMISSION', 'ROYALTIES', 'RENTAL_INCOME', 'INTEREST_INCOME', 'DIVIDENDS', 'PRIZES_AWARDS', 'REBATES_DISCOUNTS', 'OTHER_BUSINESS_INCOME', 'SALARY', 'BONUS', 'ALLOWANCES', 'BENEFITS_IN_KIND', 'PENSION', 'SEVERANCE', 'INVESTMENT_RETURN', 'CAPITAL_GAINS', 'STOCK_OPTIONS', 'MUTUAL_FUNDS', 'BONDS', 'PROPERTY_RENTAL', 'PROPERTY_LEASING', 'PROPERTY_DISPOSAL', 'CRYPTOCURRENCY_TRADING', 'DIGITAL_ASSET_MINING', 'NFT_SALES', 'DIGITAL_SERVICES', 'TRUST_DISTRIBUTION', 'ESTATE_DISTRIBUTION', 'GIFTS_RECEIVED', 'DONATIONS_RECEIVED', 'GRANTS', 'COMPENSATION', 'INSURANCE_PROCEEDS', 'INHERITANCE', 'CUSTOM', 'RETURN_OF_CAPITAL', 'SPECIFIC_EXEMPTIONS');
ALTER TABLE "IncomeRecord" ALTER COLUMN "subCategory" TYPE "IncomeSubCategory_new" USING ("subCategory"::text::"IncomeSubCategory_new");
ALTER TYPE "IncomeSubCategory" RENAME TO "IncomeSubCategory_old";
ALTER TYPE "IncomeSubCategory_new" RENAME TO "IncomeSubCategory";
DROP TYPE "public"."IncomeSubCategory_old";
COMMIT;

-- AlterEnum
ALTER TYPE "PayableType" ADD VALUE 'LOAN';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "linkedLoanId" TEXT;

-- AlterTable
ALTER TABLE "IncomeRecord" ADD COLUMN     "linkedLoanId" TEXT;

-- AlterTable
ALTER TABLE "OnboardingData" ADD COLUMN     "bankDetails" JSONB;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "loanId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activePackageId" TEXT,
ADD COLUMN     "packageEndDate" TIMESTAMP(3),
ADD COLUMN     "packageStartDate" TIMESTAMP(3),
ADD COLUMN     "packageStatus" "PackageStatus" NOT NULL DEFAULT 'TRIAL';

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "duration" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loanNumber" TEXT NOT NULL,
    "loanType" "LoanType" NOT NULL,
    "borrowerName" TEXT,
    "borrowerEmail" TEXT,
    "borrowerPhone" TEXT,
    "lenderName" TEXT,
    "lenderEmail" TEXT,
    "lenderPhone" TEXT,
    "principalAmount" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "term" INTEGER,
    "paymentFrequency" "PaymentFrequency" NOT NULL,
    "currentBalance" DOUBLE PRECISION NOT NULL,
    "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalInterestPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "purpose" TEXT,
    "collateral" TEXT,
    "notes" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerEquity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "EquityType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareholderName" TEXT,
    "description" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerEquity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Package_name_key" ON "Package"("name");

-- CreateIndex
CREATE INDEX "Package_isActive_idx" ON "Package"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_loanNumber_key" ON "Loan"("loanNumber");

-- CreateIndex
CREATE INDEX "Loan_userId_loanType_idx" ON "Loan"("userId", "loanType");

-- CreateIndex
CREATE INDEX "Loan_userId_status_idx" ON "Loan"("userId", "status");

-- CreateIndex
CREATE INDEX "Loan_userId_startDate_idx" ON "Loan"("userId", "startDate");

-- CreateIndex
CREATE INDEX "OwnerEquity_userId_type_idx" ON "OwnerEquity"("userId", "type");

-- CreateIndex
CREATE INDEX "OwnerEquity_userId_date_idx" ON "OwnerEquity"("userId", "date");

-- CreateIndex
CREATE INDEX "Expense_userId_linkedLoanId_idx" ON "Expense"("userId", "linkedLoanId");

-- CreateIndex
CREATE INDEX "IncomeRecord_userId_linkedLoanId_idx" ON "IncomeRecord"("userId", "linkedLoanId");

-- CreateIndex
CREATE INDEX "Payment_userId_loanId_idx" ON "Payment"("userId", "loanId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activePackageId_fkey" FOREIGN KEY ("activePackageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerEquity" ADD CONSTRAINT "OwnerEquity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
