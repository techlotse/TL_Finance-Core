-- v2: account fees & interest, debit dates, per-item investment growth.

-- AlterTable BankAccount
ALTER TABLE "BankAccount" ADD COLUMN "monthlyCost" DECIMAL(18,4);
ALTER TABLE "BankAccount" ADD COLUMN "monthlyCostCurrency" TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "annualInterestRate" DECIMAL(8,6);

-- AlterTable BudgetLineItem
ALTER TABLE "BudgetLineItem" ADD COLUMN "debitDayOfMonth" INTEGER;
ALTER TABLE "BudgetLineItem" ADD COLUMN "expectedAnnualReturn" DECIMAL(8,6);
ALTER TABLE "BudgetLineItem" ADD COLUMN "monthlyManagementCost" DECIMAL(18,4);
