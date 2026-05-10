# TL Finance Core - API

## Purpose

This document summarizes the REST API surface used by TL Finance Core client
components. It is not a public third-party API contract in v0.5.0.

## Architecture

API routes live under `src/app/api/**/route.ts`. Mutation routes validate Zod
schemas from `src/lib/schemas.ts`, resolve the active session, scope to the
active household, and write audit events.

Endpoint groups:

| Group | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Auth | `/api/auth/signup`, `/api/auth/signin`, `/api/auth/signout`, `/api/auth/me`, `/api/auth/reset-password/*`, `/api/auth/verify-email/*` |
| Onboarding | `POST /api/onboarding` |
| Household | `GET/PATCH /api/household`, `GET /api/household/export`, `POST /api/household/import`, `POST /api/household/switch`, `GET /api/household/list` |
| Budget | `/api/budget-items`, `/api/categories`, `/api/category-groups/[id]`, `/api/income-earners` |
| Accounts | `/api/accounts`, `/api/accounts/[id]`, `/api/accounts/[id]/snapshots`, `/projection`, `/debt-projection` |
| Transfers | `/api/transfers`, `/api/transfers/[id]` |
| Assets | `/api/assets`, `/api/assets/[id]` |
| Forecast | `/api/forecast`, `/api/forecast/account/[id]`, `/api/dashboard/summary` |
| Investments | `/api/investment-projections`, `/api/investment-projections/[id]`, `/result` |
| Admin | `/api/admin/config/*`, `/api/admin/audit-log`, `/api/admin/audit-log/prune`, `POST /api/admin/backups/run` |
| FX | `GET /api/exchange-rates/latest?from=CHF&to=EUR` |

## Configuration

Protected routes require the session cookie named by `src/lib/auth-shared.ts`.
Responses return JSON. In development, `handleApiError` may include internal
error messages. In production, it returns generic server errors.

## Deployment

No separate API service is deployed. The API is compiled into the Next.js app
container and shares the same health endpoint, database connection, and
environment variables.

## Usage

Example authenticated mutation shape:

```ts
const res = await fetch("/api/budget-items", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload)
});
```

Expected mutation rules:

1. Validate input with Zod.
2. Resolve active household.
3. Assert ownership of supplied IDs.
4. Write through Prisma.
5. Write an audit event.
6. Return serialized plain data.

## Troubleshooting

- `401` means the request lacks a valid session.
- `403` means authenticated but not allowed, usually admin-only access.
- `404` may intentionally hide ownership failures.
- `422` means validation failed.
- Never return Prisma errors directly to clients.
