-- CreateEnum
CREATE TYPE "TermUnit" AS ENUM ('DAYS', 'MONTHS', 'YEARS');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "termUnit" "TermUnit" NOT NULL DEFAULT 'MONTHS';
