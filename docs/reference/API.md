# TL Finance Core - API

## Purpose

This document summarizes the REST API surface used by TL Finance Core client
components. It is not a public third-party API contract in v0.7.9.

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
| Household | `GET/PATCH /api/household`, `GET /api/household/list`, `POST /api/household/create`, `POST /api/household/switch`, `GET /api/household/export`, `POST /api/household/import` |
| Budget | `/api/budget-items`, `/api/categories`, `/api/category-groups/[id]`, `/api/income-earners` |
| Accounts | `/api/accounts`, `/api/accounts/[id]`, `/api/accounts/[id]/snapshots`, `/projection`, `/debt-projection` |
| Transfers | `/api/transfers`, `/api/transfers/[id]` |
| Assets | `/api/assets`, `/api/assets/[id]` |
| Forecast | `/api/forecast`, `/api/forecast/account/[id]`, `/api/dashboard/summary` |
| Investments | `/api/investment-projections`, `/api/investment-projections/[id]`, `/result` |
| Advice | `POST /api/advice/ai` |
| Billing | `POST /api/billing/checkout` |
| Admin | `/api/admin/config/*`, `GET /api/admin/users`, `PATCH /api/admin/users/[id]/access`, `POST /api/admin/config/mail/test`, `/api/admin/audit-log`, `/api/admin/audit-log/prune`, `POST /api/admin/backups/run` |
| FX | `GET /api/exchange-rates/latest?from=CHF&to=EUR` |

## Configuration

Protected routes require the session cookie named by `src/lib/auth-shared.ts`.
Responses return JSON. In development, `handleApiError` may include internal
error messages. In production, it returns generic server errors.

Production deployments must set `APP_BASE_URL`. The middleware rejects unsafe
browser requests whose `Origin` does not match that public origin.

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

Scheduled transfers validate both selected account IDs and selected source /
target currency pockets. A transfer can only debit a currency pocket that exists
on the source account and credit a currency pocket that exists on the target
account.

Account create/update payloads accept `retirement?: boolean` and
`kidsSavings?: boolean`. Kids saving is only retained for Savings accounts and
clears the retirement flag. Retirement accounts are eligible for investment
account projections even when their account type remains Savings.

Household selection routes:

- `GET /api/household/list` returns the signed-in user's memberships and the
  active membership id.
- `POST /api/household/create` creates an additional owner household from the
  onboarding schema, applies the requested preset, switches the active
  household cookie, and writes an audit event.
- `POST /api/household/switch` accepts a membership id and only switches when
  that membership belongs to the signed-in user.

Mail administration routes:

- `PATCH /api/admin/config/mail` stores the SMTP host, port, TLS mode, sender,
  username, and sealed password used by password reset and verification mail.
- `POST /api/admin/config/mail/test` sends a test message to the signed-in
  admin email unless a recipient is supplied in the request body.
- Admin mail UI calls request JSON explicitly and surface non-JSON responses as
  deployment/session diagnostics.

Payment routes:

- `PATCH /api/admin/config/payments` stores public-alpha hosted payment-link
  configuration. It is admin-only and audited.
- `POST /api/billing/checkout` accepts `{ tier: "core" | "smart" | "ai" }`,
  requires a signed-in user, appends hosted-checkout reconciliation parameters,
  writes an audit event, and returns `{ ok, url }`.

User access administration routes:

- `GET /api/admin/users` lists up to 200 users with role, product tier, active
  state, verification state, membership count, and session count.
- `PATCH /api/admin/users/[id]/access` accepts
  `{ productTier?: "core" | "smart" | "ai", active?: boolean }`, lets admins
  grant paid-plan access manually, and audits the before/after access state.
  It does not mutate roles and refuses to leave the instance without an active
  admin account.

Authentication hardening:

- Sign-in failures, password reset requests, and verification email requests
  are rate-limited through audit-log counters.
- Reset and verification tokens are consumed atomically and are single-use.
- Password reset completion revokes all existing sessions for that user.

## Troubleshooting

- `401` means the request lacks a valid session.
- `403` means authenticated but not allowed, usually admin-only access.
- `404` may intentionally hide ownership failures.
- `422` means validation failed.
- Never return Prisma errors directly to clients.
