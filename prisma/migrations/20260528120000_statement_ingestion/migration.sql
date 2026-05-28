-- CreateEnum
CREATE TYPE "StatementInstitution" AS ENUM ('ubs', 'revolut', 'fnb', 'standardbank', 'investec', 'generic', 'unknown');

-- CreateEnum
CREATE TYPE "StatementImportStatus" AS ENUM ('previewed', 'committed', 'failed');

-- CreateEnum
CREATE TYPE "TransactionReviewState" AS ENUM ('needs_review', 'auto_categorized', 'confirmed', 'ignored');

-- CreateEnum
CREATE TYPE "TransactionRuleMatchType" AS ENUM ('contains', 'exact', 'starts_with');

-- CreateTable
CREATE TABLE "StatementImport" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT,
    "parserKey" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "institution" "StatementInstitution" NOT NULL DEFAULT 'unknown',
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "contentHash" TEXT NOT NULL,
    "status" "StatementImportStatus" NOT NULL DEFAULT 'previewed',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActualTransaction" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "importId" TEXT,
    "accountId" TEXT,
    "accountCurrencyId" TEXT,
    "categoryId" TEXT,
    "institution" "StatementInstitution" NOT NULL DEFAULT 'unknown',
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceAfter" DECIMAL(18,4),
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "reference" TEXT,
    "normalizedMerchantKey" TEXT,
    "raw" JSONB NOT NULL,
    "dedupeHash" TEXT NOT NULL,
    "reviewState" "TransactionReviewState" NOT NULL DEFAULT 'needs_review',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActualTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCategoryRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "matchType" "TransactionRuleMatchType" NOT NULL DEFAULT 'contains',
    "pattern" TEXT NOT NULL,
    "normalizedPattern" TEXT NOT NULL,
    "countryProfile" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTransferMatch" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "debitTransactionId" TEXT NOT NULL,
    "creditTransactionId" TEXT NOT NULL,
    "confidence" DECIMAL(8,6) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionTransferMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatementImport_householdId_contentHash_key" ON "StatementImport"("householdId", "contentHash");

-- CreateIndex
CREATE INDEX "StatementImport_householdId_createdAt_idx" ON "StatementImport"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "StatementImport_accountId_idx" ON "StatementImport"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ActualTransaction_householdId_dedupeHash_key" ON "ActualTransaction"("householdId", "dedupeHash");

-- CreateIndex
CREATE INDEX "ActualTransaction_householdId_bookingDate_idx" ON "ActualTransaction"("householdId", "bookingDate");

-- CreateIndex
CREATE INDEX "ActualTransaction_householdId_categoryId_bookingDate_idx" ON "ActualTransaction"("householdId", "categoryId", "bookingDate");

-- CreateIndex
CREATE INDEX "ActualTransaction_householdId_normalizedMerchantKey_idx" ON "ActualTransaction"("householdId", "normalizedMerchantKey");

-- CreateIndex
CREATE INDEX "ActualTransaction_importId_idx" ON "ActualTransaction"("importId");

-- CreateIndex
CREATE INDEX "ActualTransaction_accountId_bookingDate_idx" ON "ActualTransaction"("accountId", "bookingDate");

-- CreateIndex
CREATE INDEX "TransactionCategoryRule_householdId_active_priority_idx" ON "TransactionCategoryRule"("householdId", "active", "priority");

-- CreateIndex
CREATE INDEX "TransactionCategoryRule_householdId_normalizedPattern_idx" ON "TransactionCategoryRule"("householdId", "normalizedPattern");

-- CreateIndex
CREATE INDEX "TransactionCategoryRule_categoryId_idx" ON "TransactionCategoryRule"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionTransferMatch_householdId_debitTransactionId_creditTransactionId_key" ON "TransactionTransferMatch"("householdId", "debitTransactionId", "creditTransactionId");

-- CreateIndex
CREATE INDEX "TransactionTransferMatch_householdId_debitTransactionId_idx" ON "TransactionTransferMatch"("householdId", "debitTransactionId");

-- CreateIndex
CREATE INDEX "TransactionTransferMatch_householdId_creditTransactionId_idx" ON "TransactionTransferMatch"("householdId", "creditTransactionId");

-- AddForeignKey
ALTER TABLE "StatementImport" ADD CONSTRAINT "StatementImport_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementImport" ADD CONSTRAINT "StatementImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualTransaction" ADD CONSTRAINT "ActualTransaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualTransaction" ADD CONSTRAINT "ActualTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "StatementImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualTransaction" ADD CONSTRAINT "ActualTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualTransaction" ADD CONSTRAINT "ActualTransaction_accountCurrencyId_fkey" FOREIGN KEY ("accountCurrencyId") REFERENCES "BankAccountCurrency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualTransaction" ADD CONSTRAINT "ActualTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCategoryRule" ADD CONSTRAINT "TransactionCategoryRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCategoryRule" ADD CONSTRAINT "TransactionCategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTransferMatch" ADD CONSTRAINT "TransactionTransferMatch_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTransferMatch" ADD CONSTRAINT "TransactionTransferMatch_debitTransactionId_fkey" FOREIGN KEY ("debitTransactionId") REFERENCES "ActualTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTransferMatch" ADD CONSTRAINT "TransactionTransferMatch_creditTransactionId_fkey" FOREIGN KEY ("creditTransactionId") REFERENCES "ActualTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
