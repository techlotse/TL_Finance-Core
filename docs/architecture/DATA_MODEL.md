# TL Finance Core - Data Model

## Purpose

This document explains the domain model behind household budgeting, forecasting,
accounts, assets, authentication, and administration.

## Architecture

The primary tenant boundary is `Household`. Users are linked to households
through `HouseholdMember`.

Core groups:

| Group | Models |
| --- | --- |
| Identity | `User`, `Session`, `HouseholdMember`, `EmailVerificationToken`, `PasswordResetToken` |
| Household setup | `Household`, `IncomeEarner`, `CategoryGroup`, `Category` |
| Money movement | `BankAccount`, `BankAccountCurrency`, `BudgetLineItem`, `ScheduledTransfer` |
| Actual analysis | `StatementImport`, `ActualTransaction`, `TransactionCategoryRule`, `TransactionTransferMatch` |
| Forecast anchors | `BalanceSnapshot`, `ExchangeRate` |
| Net worth | `Asset`, `InvestmentProjection` |
| Operations | `AuditLog`, `AdminConfig` |

Financial records are soft-deleted with `active = false` and `deletedAt` so
historical reports can still resolve references. Live UI queries filter
`deletedAt: null`.

## Configuration

Money values use `Decimal @db.Decimal(18, 4)`. Percentages use
`Decimal @db.Decimal(8, 6)` and are stored as decimal fractions. For example,
`0.015` represents `1.5%`.

Supported recurrence values:

```text
once
weekly
monthly
quarterly
yearly
```

Supported account types:

```text
current
savings
investment
credit
cash
other
```

## Deployment

The Prisma schema is the source of truth. Existing migration files must not be
edited. From v0.7.5 onward, migration SQL is checked for destructive
statements in CI. Additive changes require a new migration:

```bash
npx prisma migrate dev --name <change-name>
```

Production environments should run:

```bash
npx prisma migrate deploy
```

## Usage

Use `src/lib/ownership.ts` before writing foreign keys supplied by a client.
Use `src/lib/household-export.ts` for portable JSON export/import; exported
payloads reference rows by stable names instead of database IDs.

## Troubleshooting

- Unique category names are scoped by household and group.
- Balance snapshots mirror the latest known current balance.
- `BankAccount.monthlyCost` is a virtual forecast cost, not an auto-created
  budget line item. Its currency is `monthlyCostCurrency`; if older data lacks
  that field, the app uses the account's first currency pocket before falling
  back to the household base currency.
- `BankAccount.retirement` marks Pillar 3a / pension-style accounts for
  long-term investment projections and retirement-aware advice.
- `BankAccount.kidsSavings` marks child-earmarked savings. The account remains
  visible, but household wealth forecasts and emergency-fund buffers exclude
  the balance.
- `InvestmentProjection` can be standalone or attached to a real investment
  account.
- `StatementImport` records a deterministic statement parser run. Imports are
  idempotent by `(householdId, contentHash)`.
- `ActualTransaction` stores normalized statement rows with signed Decimal
  amounts, original raw row JSON, review state, and a household-scoped dedupe
  hash. Positive amounts are inflows; negative amounts are outflows.
- `TransactionCategoryRule` stores deterministic category rules for actual
  transactions. Rules are household-scoped and can later be profiled by country.
- `TransactionTransferMatch` links actual debit and credit rows that represent
  internal transfers or FX exchanges so analysis can exclude them from spending.
