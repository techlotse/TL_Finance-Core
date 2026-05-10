# TL Finance Core - Database Schema

## Purpose

This document records the current PostgreSQL schema shape and migration policy
for TL Finance Core v0.5.0.

## Architecture

Schema source: `prisma/schema.prisma`.

Applied migrations:

| Migration | Purpose |
| --- | --- |
| `20260428000000_init` | Household, earners, categories, accounts, budget items, transfers, exchange rates, investment projections |
| `20260428100000_v2_fields` | Extended account and budget fields |
| `20260428200000_auth` | Users, sessions, household memberships, tokens, audit log, admin config |
| `20260429120000_balance_snapshots` | Account balance snapshot support |
| `20260429140000_assets_and_account_extensions` | Assets, investment-account fields, debt-account fields |

Schema highlights:

| Model | Notes |
| --- | --- |
| `User` | Lowercased unique email, bcrypt password hash, role, active flag |
| `Session` | SHA-256 token hash, expiry, last seen, IP hash |
| `Household` | Tenant root and base currency |
| `BudgetLineItem` | Income, expense, and investment contribution entries |
| `BankAccountCurrency` | Multi-currency account pockets |
| `ScheduledTransfer` | Account-to-account movement with recurrence |
| `Asset` | Tangible assets with signed annual appreciation rate |
| `BalanceSnapshot` | Periodic actual-balance reading per `BankAccountCurrency`; latest mirrors onto `currentBalance` |
| `AuditLog` | Append-only operational trail |
| `AdminConfig` | Singleton JSON config with sealed secret fields |
| `EmailVerificationToken` / `PasswordResetToken` | SHA-256 hashed, single-use, expiry-bounded |

`BankAccount` carries optional fields the corresponding pages read:

| Field | Used by |
| --- | --- |
| `annualInterestRate` | Savings (interest earned), credit (APR charged) |
| `expectedAnnualReturn`, `monthlyManagementCost` | Investments page projection for investment-type accounts |
| `minimumMonthlyPayment` | Debt page payoff projection for credit-type accounts |

## Configuration

Prisma uses PostgreSQL through `DATABASE_URL`. The generator includes
`linux-musl-openssl-3.0.x` so the production Alpine image contains the correct
query engine.

## Deployment

Development:

```bash
npx prisma migrate dev
```

Production:

```bash
npx prisma migrate deploy
```

Seed data:

```bash
npx prisma db seed
```

## Usage

Create new migrations for every schema change. Do not edit already-applied SQL.
Use additive changes where possible, then backfill with explicit scripts or
application-level migration code when needed.

## Troubleshooting

- If Prisma cannot find its query engine inside Docker, rebuild the image after
  `prisma generate`.
- If duplicate category names fail, check the unique constraints scoped by
  household/group.
- If migrations diverge, inspect the database migration table before changing
  local files.
