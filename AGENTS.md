# Codex Instructions — TL Finance Core

You are maintaining and extending **TL Finance Core**, a Docker-first
multi-currency household finance app. Public repo:
`techlotse/TL-Finance-Core`. The product is locale-agnostic; we ship a
**Swiss preset** out of the box (Pillar 3a, Nebenkosten, Quellensteuer, …)
plus a generic preset, with German/French stubs.

Read this file first every session, then the relevant `docs/**/*.md`
before touching anything load-bearing.

Current checkout note: this repository is now at v0.7.9 in `package.json`,
`README.md`, and the public docs. Treat the v0.5.0 section below as historical
handoff context. For the budgeting / financial-analysis / advice split and
bank-statement ingestion work, read
`docs/strategy/PRODUCT_SPLIT_AND_STATEMENT_INGESTION.md` before changing code.

---

## Current status — v0.5.0 public-handoff baseline

The project was deliberately rolled back from a v1.0.0 cut to v0.5.0 to
stage the v0.6.0 → v1.0.0 path defined in `docs/strategy/ROADMAP.md`.

What is shipped end-to-end (v0.5.0):

- **Auth**: email + password, bcryptjs cost-12, DB-backed sessions
  (`tlfc_session` cookie, SHA-256 hash stored), edge middleware blocks
  unauth requests except `/api/health` and `/api/auth/*`.
- **Tenant scoping**: every `[id]` PATCH/DELETE uses
  `findFirst({ id, householdId })` inside a transaction, or
  `updateMany`/`deleteMany` with row-count check. Soft-delete via
  `deletedAt: DateTime?` + `active: false`.
- **FK ownership**: every POST/PATCH that takes a foreign key id runs
  through `lib/ownership.ts` before writing.
- **Audit log**: append-only `AuditLog` row on every state change. IPs are
  16-char SHA-256 truncated.
- **Admin console** at `/admin`, role-gated: auth / mail / backup /
  observability config + audit-log viewer. Sealed admin secrets via
  AES-256-GCM keyed off `APP_SECRET`.
- **Onboarding wizard** at `/onboarding`.
- **Money**: Decimal(18,4) in DB, decimal.js precision-28 in code, string
  on the wire.
- **Forecast**: 1–25 yr monthly horizon, ±90 d daily walk per account, up
  to 8 accounts side-by-side.
- **Investments**: synthetic projections + projections for real
  investment-type bank accounts.
- **Debt**: payoff projection per credit account.
- **Assets**: property / vehicle / jewelry / gold etc. with signed
  appreciation rate; feeds dashboard net-worth.
- **Backup & restore**: ID-free JSON export, merge / replace import.
- **Legal**: cookie banner, `/legal/{terms,privacy,cookies}`.

What is **not yet** shipped (see `docs/review/IMPROVEMENT_OPPORTUNITIES.md`):

- SMTP delivery for password-reset / verification mails.
- Email verification token issue + consume + signin gate.
- Active household selection UI (always picks first membership today).
- Scheduled / executed S3 backup (config exists, no runner).
- Full access-control test suite.
- `APP_SECRET` rotation flow.

The v0.6.0–v1.0.0 sequence in `ROADMAP.md` closes those in order.

---

## Style guide (locked)

`docs/design/UI_SPEC.md` is the source of truth. Quick reference:

- Dark mode first, background `#0B0F14`, card `#0F151C`, muted `#161D27`.
- Brand gradient `#7A3CFF` (purple) → `#00D1C7` (cyan), 135°.
- Inter via `next/font/google`, `--font-inter` → tailwind `font-sans`.
- 8px grid, max-width 1200px.
- Lucide line icons, `strokeWidth=1.5` (`.icon-base` utility).
- Tone: technical, precise, no marketing copy.

Don't hard-code hex values — use Tailwind theme tokens
(`bg-card`, `text-foreground`, `border-border`, etc.).

---

## Stack (locked)

- Next.js 15 App Router · React 19 · TypeScript strict
- Tailwind + custom primitives in `src/components/ui/`
- Recharts · Prisma + PostgreSQL 16 · Zod · decimal.js
- bcryptjs (pure JS) · Node `crypto` (AES-256-GCM)
- Docker multi-stage · GitHub Actions multi-arch (amd64 + arm64)

---

## Code layout

```
src/
  middleware.ts             edge auth gate (cookie + path allowlist only)
  app/
    api/
      health/               public liveness probe
      auth/                 signup, signin, signout, me, reset-password/{request,complete}, verify-email/{request,[token]}
      onboarding/           POST — apply preset
      admin/
        config/{auth,mail,backup,observability}/   PATCH (admin-only)
        audit-log/          GET, prune/ POST
        backups/run/        POST — trigger pg_dump (admin-only)
      accounts/             POST list; [id]/ PATCH DELETE; [id]/snapshots; [id]/projection; [id]/debt-projection
      assets/               POST list; [id]/ PATCH DELETE
      budget-items/         POST list; [id]/ PATCH DELETE
      categories/           POST list; [id]/ PATCH DELETE
      category-groups/[id]/ PATCH DELETE
      exchange-rates/latest GET
      forecast/             GET monthly; account/[id]/ GET daily
      household/            GET PATCH; export/ GET; import/ POST; switch/ POST
      income-earners/       POST list; [id]/ PATCH DELETE
      investment-projections/ POST list; [id]/ PATCH DELETE result/
      transfers/            POST list; [id]/ PATCH DELETE
      dashboard/summary/    GET
    admin/                  admin UI (subnav: overview/auth/mail/backups/observability)
    onboarding/             4-step wizard
    signin/  signup/  forgot-password/  reset-password/[token]/  verify-email/[token]/
    legal/{terms,privacy,cookies}/
    accounts/  budget/  forecast/  investments/  debt/  assets/  settings/  transfers/
    page.tsx                Dashboard
    layout.tsx              Inter, ThemeProvider, AppShell, CookieBanner
  components/
    app-shell.tsx           server shell — resolves session, renders nav
    nav.tsx                 client side-nav, hides on auth/legal/onboarding
    cookie-banner.tsx       necessary-only / accept-all
    ui/                     Button Card Input Select Switch Badge Dialog Table FormField
    charts/dashboard-charts.tsx
    money-amount.tsx · page-header.tsx · theme-toggle.tsx · theme-provider.tsx
  lib/
    prisma.ts
    auth.ts · auth-shared.ts (edge-safe SESSION_COOKIE)
    admin-guard.ts
    admin-config.ts          singleton config + sealed-secret helpers
    audit.ts · audit-retention.ts · logger.ts
    crypto.ts                AES-256-GCM seal/open + sha256 + randomToken
    mailer.ts                SMTP adapter (uses admin mailConfig)
    ownership.ts
    household.ts             getActiveHousehold / Id / OrOnboarding / membership role
    active-household.ts      cookie-backed active-membership selection
    onboarding.ts
    backup-runner.ts         pg_dump runner (manual / scheduled)
    category-presets.ts      swiss + generic + stubs
    money.ts · exchange-rates.ts · forecast.ts · recurrence.ts · investment.ts · debt.ts
    schemas.ts · api.ts · household-export.ts
prisma/
  schema.prisma
  migrations/                additive only
  seed.ts                    optional dev demo user
docs/
  README.md                  index
  architecture/              ARCHITECTURE.md, DATA_MODEL.md
  operations/DEPLOYMENT.md
  reference/                 API.md, DATABASE_SCHEMA.md, DEFAULT_CATEGORIES.md
  product/USER_GUIDE.md
  design/UI_SPEC.md
  strategy/ROADMAP.md        v0.6 → v1.0 plan
  review/                    IMPROVEMENT_OPPORTUNITIES.md, ACCESS_CONTROL_REVIEW.md
  release/CHANGELOG.md
  blogpost/ANNOUNCEMENT_POST.md
old-docs/                    pre-rebrand archive — git-ignored, do not link from public docs
docker-compose.yml
docker-compose-multinode.yml
nginx.conf · setup-local.{ps1,sh} · Dockerfile · .github/workflows/
```

---

## Conventions

### Money
- DB: `Decimal @db.Decimal(18, 4)`. Percentages: `Decimal @db.Decimal(8, 6)`,
  decimal fraction (0.0125 = 1.25 %). **Never** `Float`.
- Code: `toDecimal(...)`. Stay in `Decimal` until display.
- Wire format: **string**, every time. Zod `moneyAmount` coerces both.

### API routes
- Validate every mutation body against a Zod schema in `lib/schemas.ts`.
- All errors through `handleApiError` — never raw Prisma errors.
- Production hides err.message; dev shows it.

### Tenant scoping (mandatory pattern for new `[id]` routes)
```ts
const householdId = await getActiveHouseholdId();
await assertCategoryOwnership(householdId, body.categoryId); // FK first

const updated = await prisma.$transaction(async (tx) => {
  const found = await tx.budgetLineItem.findFirst({
    where: { id, householdId },
    select: { id: true }
  });
  if (!found) throw new OwnershipError("Budget item not found", 404);
  return tx.budgetLineItem.update({ where: { id }, data: { ... } });
});

await writeAudit({ action: "update", householdId, resourceType: "budget_item",
                   resourceId: id, ipHash: ipHashFromHeaders(req.headers) });
```

For DELETE: `updateMany` (soft) or `deleteMany` (hard) with row-count check,
both scoped by `householdId`.

### Soft delete
- Default sets `active = false` AND `deletedAt = now()`.
- Live UI / forecast queries filter `deletedAt: null`.
- Hard delete (`?force=true`) is rejected when any FK still points to the row.

### Audit log
- Every state-changing route writes an `AuditLog` row, fire-and-forget.
- IPs hashed (truncated SHA-256, 16 chars). Never raw IPs at rest.
- Retention configurable via admin observability; prune via
  `lib/audit-retention.ts`.

### Admin secrets
- Plaintext round-trip secrets (SMTP password, S3 secret access key) are
  stored as `*Cipher` fields inside `AdminConfig` JSONB columns.
- Use `sealSecret` to write, `revealSecret` server-only to read,
  `redactedPreview` for UI display.

### Migrations
- Additive only. Never edit a past migration. Next prefix:
  bump from the latest `prisma/migrations/<timestamp>_*` directory.

### Forecast invariants (load-bearing — golden tests required to refactor)
- Per-(account, currency) native balances; FX only at snapshot time.
- `monthlyCost` is virtual — never auto-creates a `BudgetLineItem`.
- Savings interest = `(1+r)^(1/12) − 1` per pocket per month, positive
  balances only.
- Investment growth = `(1+r)^(1/12) − 1` per month, minus
  `monthlyManagementCost`.
- `debitDayOfMonth` clamps to last day of shorter months.

### UI
- Dark mode first-class. Tailwind theme tokens only.
- Forms reuse `FormField`, `Input`, `Select`, `Dialog`, `Switch`.
- Tables reuse `Table/THead/TBody/TR/TH/TD`.
- Server components fetch + pass plain serialisable rows; client owns state.
  Cast `Decimal` → string at the boundary.
- Auth / legal / onboarding pages hide the side nav — see
  `HIDE_NAV_PREFIXES` in `nav.tsx`.

### Git / secrets
- `.env` gitignored. Template `.env.example`.
- `APP_SECRET` is critical: keys all sealed admin secrets. Back it up.
  Rotation requires re-entering every sealed value (rotation flow is on
  the v0.7 punch list).
- Shell scripts + Docker files locked to LF via `.gitattributes`.

---

## When making a change

1. Read the relevant `docs/**/*.md` first — describes intent, not just shape.
2. Add/extend a Zod schema if API surface changes.
3. Add a Prisma migration if schema changes (additive only).
4. Apply the tenant-scoping + audit pattern to any new `[id]` route.
5. Update relevant `docs/` file in the same change.
6. Typecheck before declaring done.

## Do not

- Persist money as JS floats.
- Edit a past migration.
- Bypass `lib/exchange-rates.ts` — owns caching, fallback, stale-marking.
- Couple UI components directly to Prisma types.
- Auto-create budget rows for synthetic costs (bank fees) — virtual engine
  events only.
- Return raw error details in production.
- Hard-delete a row that other rows still reference.
- Re-introduce the legacy `default-household` ID — every household belongs
  to a `HouseholdMember`.
- Link `old-docs/` from public docs. It's the pre-rebrand archive.
