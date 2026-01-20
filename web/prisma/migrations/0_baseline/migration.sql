-- DropForeignKey
ALTER TABLE "public"."Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Customer" DROP CONSTRAINT "Customer_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DigitalAsset" DROP CONSTRAINT "DigitalAsset_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Expense" DROP CONSTRAINT "Expense_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Expense" DROP CONSTRAINT "Expense_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."FixedAsset" DROP CONSTRAINT "FixedAsset_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."IncomeRecord" DROP CONSTRAINT "IncomeRecord_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."InventoryItem" DROP CONSTRAINT "InventoryItem_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_saleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Loan" DROP CONSTRAINT "Loan_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."OnboardingData" DROP CONSTRAINT "OnboardingData_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."OwnerEquity" DROP CONSTRAINT "OwnerEquity_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_expensesId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_incomeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_loanId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_quotationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_saleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProductRecipe" DROP CONSTRAINT "ProductRecipe_outputInventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProductRecipe" DROP CONSTRAINT "ProductRecipe_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Production" DROP CONSTRAINT "Production_outputInventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Production" DROP CONSTRAINT "Production_recipeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Production" DROP CONSTRAINT "Production_saleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Production" DROP CONSTRAINT "Production_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProductionInput" DROP CONSTRAINT "ProductionInput_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProductionInput" DROP CONSTRAINT "ProductionInput_productionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Purchase" DROP CONSTRAINT "Purchase_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Purchase" DROP CONSTRAINT "Purchase_sourceQuotationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Purchase" DROP CONSTRAINT "Purchase_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PurchaseItem" DROP CONSTRAINT "PurchaseItem_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PurchaseItem" DROP CONSTRAINT "PurchaseItem_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Quotation" DROP CONSTRAINT "Quotation_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Quotation" DROP CONSTRAINT "Quotation_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RecipeIngredient" DROP CONSTRAINT "RecipeIngredient_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RecipeIngredient" DROP CONSTRAINT "RecipeIngredient_recipeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Sale" DROP CONSTRAINT "Sale_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Sale" DROP CONSTRAINT "Sale_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SaleItem" DROP CONSTRAINT "SaleItem_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SaleItem" DROP CONSTRAINT "SaleItem_productionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SaleItem" DROP CONSTRAINT "SaleItem_saleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Security" DROP CONSTRAINT "Security_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StockAdjustment" DROP CONSTRAINT "StockAdjustment_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StockAdjustment" DROP CONSTRAINT "StockAdjustment_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_activePackageId_fkey";

-- DropTable
DROP TABLE "public"."Account";

-- DropTable
DROP TABLE "public"."Customer";

-- DropTable
DROP TABLE "public"."DigitalAsset";

-- DropTable
DROP TABLE "public"."Expense";

-- DropTable
DROP TABLE "public"."FixedAsset";

-- DropTable
DROP TABLE "public"."IncomeRecord";

-- DropTable
DROP TABLE "public"."InventoryItem";

-- DropTable
DROP TABLE "public"."Invoice";

-- DropTable
DROP TABLE "public"."Loan";

-- DropTable
DROP TABLE "public"."OnboardingData";

-- DropTable
DROP TABLE "public"."OtpCode";

-- DropTable
DROP TABLE "public"."OwnerEquity";

-- DropTable
DROP TABLE "public"."Package";

-- DropTable
DROP TABLE "public"."Payment";

-- DropTable
DROP TABLE "public"."ProductRecipe";

-- DropTable
DROP TABLE "public"."Production";

-- DropTable
DROP TABLE "public"."ProductionInput";

-- DropTable
DROP TABLE "public"."Purchase";

-- DropTable
DROP TABLE "public"."PurchaseItem";

-- DropTable
DROP TABLE "public"."Quotation";

-- DropTable
DROP TABLE "public"."RecipeIngredient";

-- DropTable
DROP TABLE "public"."Sale";

-- DropTable
DROP TABLE "public"."SaleItem";

-- DropTable
DROP TABLE "public"."Security";

-- DropTable
DROP TABLE "public"."Session";

-- DropTable
DROP TABLE "public"."StockAdjustment";

-- DropTable
DROP TABLE "public"."User";

-- DropTable
DROP TABLE "public"."VerificationToken";

-- DropTable
DROP TABLE "public"."Waitlist";

-- DropEnum
DROP TYPE "public"."AdjustmentType";

-- DropEnum
DROP TYPE "public"."AssetStatus";

-- DropEnum
DROP TYPE "public"."CustomerRole";

-- DropEnum
DROP TYPE "public"."DigitalAssetType";

-- DropEnum
DROP TYPE "public"."DiscountType";

-- DropEnum
DROP TYPE "public"."EquityType";

-- DropEnum
DROP TYPE "public"."ExpenseCategory";

-- DropEnum
DROP TYPE "public"."ExpenseStatus";

-- DropEnum
DROP TYPE "public"."FixedAssetCategory";

-- DropEnum
DROP TYPE "public"."IncomeMainCategory";

-- DropEnum
DROP TYPE "public"."IncomeRecordStatus";

-- DropEnum
DROP TYPE "public"."IncomeSubCategory";

-- DropEnum
DROP TYPE "public"."InventoryType";

-- DropEnum
DROP TYPE "public"."InvoiceStatus";

-- DropEnum
DROP TYPE "public"."LoanStatus";

-- DropEnum
DROP TYPE "public"."LoanType";

-- DropEnum
DROP TYPE "public"."PackageStatus";

-- DropEnum
DROP TYPE "public"."PayableType";

-- DropEnum
DROP TYPE "public"."PaymentCategory";

-- DropEnum
DROP TYPE "public"."PaymentFrequency";

-- DropEnum
DROP TYPE "public"."PaymentMethod";

-- DropEnum
DROP TYPE "public"."ProductionStatus";

-- DropEnum
DROP TYPE "public"."PurchaseStatus";

-- DropEnum
DROP TYPE "public"."PurchaseType";

-- DropEnum
DROP TYPE "public"."QuotationStatus";

-- DropEnum
DROP TYPE "public"."SaleSourceType";

-- DropEnum
DROP TYPE "public"."SaleStatus";

-- DropEnum
DROP TYPE "public"."SecurityType";

-- DropEnum
DROP TYPE "public"."TermUnit";

-- DropEnum
DROP TYPE "public"."WaitlistStatus";
