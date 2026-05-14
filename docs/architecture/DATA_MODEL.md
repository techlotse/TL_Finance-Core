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
  budget line item.
- `InvestmentProjection` can be standalone or attached to a real investment
  account.
