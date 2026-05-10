-- Add per-account fields needed by the Investments and Debt pages, plus the
-- Asset model used by the Assets page. All additive — no existing row is
-- touched, every new column is nullable, every new table is fresh.

-- ---------------------------------------------------------------
-- BankAccount: extra projection / payoff fields
-- ---------------------------------------------------------------
ALTER TABLE "BankAccount"
  ADD COLUMN "expectedAnnualReturn"  DECIMAL(8,6),
  ADD COLUMN "monthlyManagementCost" DECIMAL(18,4),
  ADD COLUMN "minimumMonthlyPayment" DECIMAL(18,4);

-- ---------------------------------------------------------------
-- Asset
-- ---------------------------------------------------------------
CREATE TYPE "AssetCategory" AS ENUM (
  'property',
  'vehicle',
  'jewelry',
  'collectible',
  'precious_metal',
  'electronics',
  'other'
);

CREATE TABLE "Asset" (
  "id"                      TEXT          NOT NULL,
  "householdId"             TEXT          NOT NULL,
  "name"                    TEXT          NOT NULL,
  "category"                "AssetCategory" NOT NULL DEFAULT 'other',
  "value"                   DECIMAL(18,4) NOT NULL,
  "currency"                TEXT          NOT NULL,
  "annualAppreciationRate"  DECIMAL(8,6)  NOT NULL DEFAULT 0,
  "acquiredAt"              TIMESTAMP(3),
  "notes"                   TEXT,
  "active"                  BOOLEAN       NOT NULL DEFAULT true,
  "deletedAt"               TIMESTAMP(3),
  "createdAt"               TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Asset_householdId_idx" ON "Asset"("householdId");

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
