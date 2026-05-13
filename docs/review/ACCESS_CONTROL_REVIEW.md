# TL Finance Core - Access Control Review

## Purpose

This document inventories every protected route in the app, names the gate
that protects it, and records the threat the gate is meant to stop. It
is backed by database integration tests expanded for v0.7.3.

## Architecture

There are three concentric gates:

| Layer | Where | What it stops |
| --- | --- | --- |
| Edge middleware | `src/middleware.ts` | Unauthenticated requests to anything not on the public allowlist |
| Session resolution | `getSession` / `requireSession` in `src/lib/auth.ts` | Stale, expired, or revoked sessions |
| Tenant + role | `getActiveHouseholdId`, `requireAdminApi`, `lib/ownership.ts` | Cross-tenant data access; role escalation |

A request reaches a Prisma write only after passing all three.

## Configuration

Public allowlist (no session required):

| Path prefix | Reason |
| --- | --- |
| `/api/health` | Load-balancer probe |
| `/api/auth/*` | Sign-in, sign-up, reset, verify — must work pre-auth |
| `/signin`, `/signup`, `/forgot-password` | Auth UI |
| `/reset-password/[token]`, `/verify-email/[token]` | Token-bearing auth pages |
| `/legal/*` | Terms / privacy / cookies |
| `/_next/*`, `/favicon`, `/assets/*` | Static |

Everything else carrying a 401 if no session cookie is present.

## Deployment

The middleware runs on Edge so it cannot import Prisma. Real session
validation happens in route handlers via `getSession()` which reads the
session row from PostgreSQL and rejects expired or inactive users.

## Usage

### Routes inventory

#### Auth (public, no session required)

| Route | Method | Notes |
| --- | --- | --- |
| `/api/auth/signup` | POST | Honours `signupEnabled` flag; sends verification mail when required |
| `/api/auth/signin` | POST | Generic 401 on bad creds; rate-limited per IP via audit-log count |
| `/api/auth/signout` | POST | Always idempotent |
| `/api/auth/me` | GET | Returns null if no session |
| `/api/auth/reset-password/request` | POST | Always 200 — never confirms whether email exists; rate-limited per IP |
| `/api/auth/reset-password/complete` | POST | Token consumed atomically with password update; all sessions revoked |
| `/api/auth/verify-email/request` | POST | Requires session; rate-limited per IP/user; resending only for the signed-in user |
| `/api/auth/verify-email/[token]` | POST | Public; token bearer authenticates the request itself; single-use consume |

#### Household-scoped (session + tenant gate)

Every list/POST endpoint resolves `householdId = await getActiveHouseholdId()`
and writes only with that scope. Every `[id]` mutation runs
`findFirst({ where: { id, householdId } })` inside a transaction or uses
`updateMany`/`deleteMany` with row-count check.

| Route | Tenant gate | FK ownership |
| --- | --- | --- |
| `/api/accounts` | householdId on POST | `lib/ownership.ts` (none — no FK in body) |
| `/api/accounts/[id]` | findFirst id+householdId | — |
| `/api/accounts/[id]/snapshots` | findFirst account.id+householdId, then pocket.accountId | — |
| `/api/accounts/[id]/projection` | findFirst id+householdId | — |
| `/api/accounts/[id]/debt-projection` | findFirst id+householdId | — |
| `/api/budget-items` | householdId on GET/POST | `assertBudgetItemFkOwnership` |
| `/api/budget-items/[id]` | findFirst id+householdId | `assertBudgetItemFkOwnership` |
| `/api/categories` | householdId | `assertCategoryGroupOwnership` |
| `/api/categories/[id]` | findFirst id+householdId | `assertCategoryGroupOwnership` if groupId changes |
| `/api/category-groups/[id]` | findFirst id+householdId | — |
| `/api/income-earners` | householdId | — |
| `/api/income-earners/[id]` | findFirst id+householdId | — |
| `/api/transfers` | householdId | `assertTransferFkOwnership` |
| `/api/transfers/[id]` | findFirst id+householdId | `assertTransferFkOwnership` |
| `/api/investment-projections` | householdId | `assertAccountOwnership` if `accountId` |
| `/api/investment-projections/[id]` | findFirst id+householdId | — |
| `/api/investment-projections/[id]/result` | findFirst id+householdId | — |
| `/api/assets` | householdId | — |
| `/api/assets/[id]` | findFirst id+householdId | — |
| `/api/dashboard/summary` | household.id on every read | — |
| `/api/forecast` | household.id on every read | — |
| `/api/forecast/account/[id]` | findFirst id+householdId | — |
| `/api/household` | getActiveHousehold | — |
| `/api/household/list` | Lists only memberships belonging to the caller | — |
| `/api/household/create` | Creates an owner household for the caller and switches to it | — |
| `/api/household/export` | householdId | — |
| `/api/household/import` | householdId; merges by name (no cross-tenant ids) | — |
| `/api/household/switch` | Validates target membership belongs to caller | — |
| `/api/onboarding` | Refuses if user already has any membership | — |
| `/api/exchange-rates/latest` | Session required; data is global anyway | — |
| `/api/billing/checkout` | Session required; payment config is global | — |

#### Admin role-gated

`requireAdminApi` returns 401 if no session, 403 if the session's user has
role !== "admin". Role is set on the User row at signup (first user only)
and mutated by future admin-management UI.

| Route | Method | Notes |
| --- | --- | --- |
| `/api/admin/config/auth` | PATCH | Audited |
| `/api/admin/config/ai` | PATCH | Audited; cipher field never echoed |
| `/api/admin/config/mail` | PATCH | Audited; cipher field never echoed |
| `/api/admin/config/mail/test` | POST | Sends a test email; audited |
| `/api/admin/config/payments` | PATCH | Audited; hosted checkout URLs only |
| `/api/admin/config/backup` | PATCH | Audited; cipher field never echoed |
| `/api/admin/config/observability` | PATCH | Audited |
| `/api/admin/audit-log` | GET | Read-only listing |
| `/api/admin/audit-log/prune` | POST | Audited; honours retention setting |
| `/api/admin/backups/run` | POST | Synchronous pg_dump trigger; audited |

### Pages

Server pages call `getActiveHousehold()` (throws 401/409) or
`getActiveHouseholdOrOnboarding()` (returns a discriminated union). The
dashboard redirects to `/onboarding` for users without memberships.

`/admin/*` server layout reads the session and redirects to `/signin` for
anonymous users or `/` for non-admins before any admin component renders.

### Cookie surface

| Cookie | HttpOnly | SameSite | Purpose |
| --- | --- | --- | --- |
| `tlfc_session` | Yes | Lax | Session token (random 32-byte; SHA-256 hash stored) |
| `tlfc_active_household` | Yes | Lax | Selected membership; server re-validates on every read |

Theme + cookie consent are stored in `localStorage` (not cookies) and never
read by server code.

## Troubleshooting

When you suspect a tenant-leak:

1. Re-grep `findFirst.*householdId` and `assertCategoryOwnership|assertAccountOwnership|assertIncomeEarnerOwnership|assertCategoryGroupOwnership|assertBudgetItemFkOwnership|assertTransferFkOwnership` to confirm the route is on the list above.
2. If the route writes via Prisma without one of those gates, file it under "Pending tests" in `docs/review/IMPROVEMENT_OPPORTUNITIES.md`.
3. Forge the active-household cookie pointing at a foreign membership id; the server should ignore it (selection is only honoured if the user owns that membership row).
4. Forge the session cookie with a stale/invalid token; the server should treat the request as anonymous.

## Automated tests

The v0.7.3 access suite in `src/lib/access-control.int.test.ts` runs against a
real migrated PostgreSQL database and covers:

- Forged active-household cookies pointing at another user's membership.
- Rejected household switching to another user's membership.
- Successful switching between memberships owned by the signed-in user.
- Rejected cross-tenant PATCH across account, category, category group, income
  earner, budget item, transfer, asset, and investment projection routes.
- Rejected cross-tenant DELETE across the same protected mutable resources,
  including routes that run reference checks before destructive operations.
- Rejected attempts to attach owned rows to another household's category group,
  category, account, income earner, transfer account, or projection account.
- Rejected admin configuration writes from non-admin users.
- Password reset and verification resend rate limits.
- Single-use password reset tokens with session revocation.
- Single-use email verification tokens.

Additional static readiness checks run through `npm run test:readiness:v0.8`
and cover payment route presence, `/admin` isolation, HA deployment assets,
migration safety, and backup import compatibility.

Pending for beta: browser-level smoke coverage for auth, admin, onboarding,
payments, and SMTP flows.
