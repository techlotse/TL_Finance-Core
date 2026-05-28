# TL Finance Core - User Guide

## Purpose

This guide explains how an instance user sets up and operates TL Finance Core
v0.7.9.

## Architecture

The user-facing product is organized around one active household selected from
the signed-in user's memberships:

```text
Onboarding -> Dashboard
Dashboard -> Accounts, Budget, Transfers, Analysis, Assets, Debt, Forecast, Investments
Settings -> Household, earners, categories, preferences, billing, backup/import-export
Admin -> Auth, users, mail, AI, payments, backups, observability, audit log
```

## Configuration

First setup asks for:

| Step | Input |
| --- | --- |
| Household | Display name |
| Currency | Base currency for totals and charts |
| Earners | One or two income earners |
| Preset | Swiss, generic, German fallback, or French fallback |

The first registered user becomes the administrator.

## Deployment

Users do not deploy from the UI. Operators should deploy with Docker, run
migrations, and then invite users to sign up if registration is enabled.

## Usage

Core workflows:

1. Add accounts with one or more currency pockets.
2. Record current balances and periodic balance snapshots.
3. Add income, expenses, and investment contributions in Budget.
4. Add recurring transfers between accounts.
5. Add tangible assets with current value and appreciation/depreciation rate.
6. Use Debt to inspect credit account payoff behavior.
7. Use Forecast to inspect net worth and account-level movement.
8. Use Investments to model long-term contribution scenarios.
9. Switch between households from the navigation or Settings when the user has
   more than one membership.
10. Create additional households from Settings when a separate finance context
    is needed.
11. Review the current tier and available upgrades in Settings -> Billing when
    the instance operator enables public-alpha payments.
12. Export household JSON in Settings before destructive import or major
    changes.
13. Use statement-import preview APIs to validate bank files before committing
    actual transactions to the analysis ledger.

Savings and investment planning:

- Use a scheduled transfer when money should move between two real accounts,
  for example current account -> Pillar 3a or investment account. Transfers
  into accounts with type `Investment` or the Retirement / Pillar 3a flag count
  as planned investing in advice and linked account projections.
- Mark Pillar 3a or retirement-style accounts with the Retirement flag so they
  are treated as long-term investment assets even if the account type is
  Savings.
- Mark child-earmarked savings accounts with Kids saving. These balances stay
  visible on the account but are excluded from household wealth projections and
  emergency-fund buffers.
- Use an investment budget item when the contribution is only a planning bucket
  with expected return assumptions and no real target account balance.
- Do not enter the same monthly saving as both an investment budget item and a
  scheduled transfer unless you intentionally want both effects; that double
  counts the outflow in forecasts.
- Emergency-fund targets use essential expenses only. Savings, retirement, and
  investing transfers are treated as non-essential planned outflows, not as
  emergency needs.
- Swiss Bridge advice adds a three-tier Swiss-style unemployment bridge:
  two months of immediate cash, one year of three-month notice cover, and two
  years of longer notice cover. Retirement and Kids saving balances are
  excluded from these bridge targets.

Statement analysis:

- Structured imports should go through preview first. Preview returns detected
  parser, row counts, row warnings, and sample rows without writing actual
  transactions.
- Committed actual transactions are idempotent by file content and row dedupe
  hash, so re-importing the same file should not duplicate spending.
- Unknown or ambiguous rows remain in review state until categorized or matched
  as internal transfers.
- Budget planning remains usable without accounts; statement analysis can link
  imports to accounts when the user wants account-level actuals.

Admin workflows:

1. Configure registration, session policy, and auth rate limits.
2. Grant manual plan access or suspend/reactivate accounts under Users.
3. Configure SMTP values, send the built-in test email, then test password
   reset and verification delivery.
4. Enable backups, run a manual backup, and test restore before public use.
5. Configure hosted payment links under Payments for public-alpha billing.
6. Review audit events and prune old entries according to retention policy.

## Troubleshooting

- If totals look wrong, check each account currency pocket and the household
  base currency.
- If a forecast dips unexpectedly, inspect account fees, transfer dates,
  debit day of month, and recurring expenses.
- If FX rates are stale, the app uses cached rates and surfaces a warning.
- For Hostpoint SMTP, use host `asmtp.mail.hostpoint.ch`, port `465`, TLS mode
  `Implicit TLS / SSL`, the full mailbox as SMTP user, and a From email that
  Hostpoint allows for that mailbox.
- If a destructive import is needed, export current data first.
