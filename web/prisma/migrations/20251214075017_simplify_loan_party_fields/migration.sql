/*
  Warnings:

  - You are about to drop the column `borrowerEmail` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `borrowerName` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `borrowerPhone` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `lenderEmail` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `lenderName` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `lenderPhone` on the `Loan` table. All the data in the column will be lost.
  - Added the required column `partyName` to the `Loan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "borrowerEmail",
DROP COLUMN "borrowerName",
DROP COLUMN "borrowerPhone",
DROP COLUMN "lenderEmail",
DROP COLUMN "lenderName",
DROP COLUMN "lenderPhone",
ADD COLUMN     "insuranceFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "managementFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "partyEmail" TEXT,
ADD COLUMN     "partyName" TEXT NOT NULL,
ADD COLUMN     "partyPhone" TEXT,
ADD COLUMN     "processingFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalCharges" DOUBLE PRECISION NOT NULL DEFAULT 0;
