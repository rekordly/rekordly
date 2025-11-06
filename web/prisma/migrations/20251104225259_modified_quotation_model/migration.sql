/*
  Warnings:

  - You are about to drop the column `workmanshipTotal` on the `Quotation` table. All the data in the column will be lost.
  - The `workmanship` column on the `Quotation` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Quotation" DROP COLUMN "workmanshipTotal",
DROP COLUMN "workmanship",
ADD COLUMN     "workmanship" DOUBLE PRECISION NOT NULL DEFAULT 0;
