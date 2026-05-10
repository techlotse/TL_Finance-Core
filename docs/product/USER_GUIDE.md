# TL Finance Core - User Guide

## Purpose

This guide explains how an instance user sets up and operates TL Finance Core
v0.5.0.

## Architecture

The user-facing product is organized around one active household:

```text
Onboarding -> Dashboard
Dashboard -> Accounts, Budget, Transfers, Assets, Debt, Forecast, Investments
Settings -> Household, earners, categories, preferences, backup/import-export
Admin -> Auth, mail, backups, observability, audit log
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
9. Export household JSON in Settings before destructive import or major changes.

Admin workflows:

1. Configure registration and session policy.
2. Configure SMTP values, then test password reset and verification delivery.
3. Enable backups, run a manual backup, and test restore before public use.
4. Review audit events and prune old entries according to retention policy.

## Troubleshooting

- If totals look wrong, check each account currency pocket and the household
  base currency.
- If a forecast dips unexpectedly, inspect account fees, transfer dates,
  debit day of month, and recurring expenses.
- If FX rates are stale, the app uses cached rates and surfaces a warning.
- If a destructive import is needed, export current data first.
