-- Adds BalanceSnapshot for periodic actual-balance readings (growth /
-- dividends / interest that the budget items and scheduled transfers don't
-- explicitly model). Additive only — no existing tables modified.

CREATE TABLE "BalanceSnapshot" (
  "id"                TEXT      NOT NULL,
  "accountCurrencyId" TEXT      NOT NULL,
  "balance"           DECIMAL(18,4) NOT NULL,
  "asOf"              TIMESTAMP(3) NOT NULL,
  "note"              TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BalanceSnapshot_accountCurrencyId_asOf_idx"
  ON "BalanceSnapshot"("accountCurrencyId", "asOf");

ALTER TABLE "BalanceSnapshot"
  ADD CONSTRAINT "BalanceSnapshot_accountCurrencyId_fkey"
  FOREIGN KEY ("accountCurrencyId") REFERENCES "BankAccountCurrency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
