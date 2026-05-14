# TL Finance Core - Development Process

## Purpose

TL Finance Core started as a practical requirement: one place to model a
household budget, current balances, recurring transfers, assets, debt, and
long-range forecasts without sending financial data to a third-party service.

The v0.5.0 release is the public baseline. The feature set is intentionally
stable: budget items, multi-currency accounts, recurring transfers, asset
tracking, debt visibility, investment projections, dashboards, forecasts,
admin configuration, audit logs, and portable JSON export/import.

This is the version that moves from the original development repository into
`techlotse/TL-Finance-Core`.

## Architecture

The product is built as a Docker-first Next.js application with PostgreSQL and
Prisma. The app uses server components for reads, route handlers for mutations,
and a small set of focused libraries for money, recurrence, forecasting,
exchange rates, ownership checks, audit logging, and authentication.

The important design choice is precision. Finance software should not rely on
floating-point arithmetic for persisted money. TL Finance Core stores money as
database decimals, uses decimal arithmetic in application code, and passes
amounts over the wire as strings.

The second important design choice is ownership. Every household-scoped write
checks the active household before touching data. Related IDs such as accounts,
categories, earners, and transfer targets are verified before they are attached
to a record.

The current stack:

- Next.js 15, React 19, TypeScript strict
- Tailwind CSS with a dark-first TL Finance Core interface
- PostgreSQL 16 through Prisma
- bcrypt password hashing and database-backed sessions
- AES-256-GCM sealed admin secrets
- Docker single-node and local multinode stacks

## Configuration

The interface follows TL Finance Core Style Guide v1.0: dark background
`#0B0F14`, purple to cyan gradient `#7A3CFF` to `#00D1C7`, Inter typography,
8px spacing, a 1200px content width, and line-based icons.

The documentation has also been reorganized around the same principle: fewer
files, clearer modules, and technical language that explains the system without
turning the repository into a sales page.

## Deployment

v0.5.0 can run as a single Docker Compose stack for local use, or as a local
multinode stack with nginx, two app instances, PostgreSQL primary/replica, and
Redis. The multinode stack is useful for testing failure paths and operational
shape before public alpha.

The deployment path is intentionally conservative:

1. Build the app image.
2. Start Postgres and the app.
3. Run Prisma migrations.
4. Seed demo data only when needed.
5. Validate `/api/health`.
6. Sign up and complete household onboarding.

## Usage

The current product is already usable as a personal finance core:

- Track income, expenses, and investment contributions.
- Track accounts with multiple currencies.
- Add balance snapshots to anchor forecasts to reality.
- Schedule recurring transfers between accounts.
- Track assets such as property, vehicles, precious metals, and collectibles.
- Model debt payoff and investment scenarios.
- Export and import household data as portable JSON.

The next releases will focus less on adding features and more on making the
existing feature set ready for wider access.

Roadmap:

- v0.6.0: user separation and in-app authentication refinement.
- v0.7.0: authentication and access security hardening.
- v0.7.3: public-alpha payment, HA, migration, and backup readiness prep.
- v0.7.5: security audit fixes and production-origin hardening.
- v0.8.0: public alpha in HA with a payment provider for the SaaS version.
- v0.9.0: bug fixes and public beta readiness.
- v1.0.0: stable public release with the v0.5.0 feature set preserved.

## Troubleshooting

The remaining work is clear. SMTP delivery and email verification now have the
first complete implementation path, but they still need provider-level smoke
tests. Backups need scheduled execution, S3-compatible upload, and restore
validation. The multi-household model needs broader access tests before public
alpha.

That is a good place for a project to be at v0.5.0: the core is coherent, the
risks are named, and the next milestones are about hardening rather than
guessing what the product should become.

Suggested social excerpt:

TL Finance Core v0.5.0 is now ready as the public baseline for a Docker-first,
self-hosted household finance core. It includes budgeting, multi-currency
accounts, transfers, assets, debt, forecasts, investment projections, admin
configuration, audit logs, and portable JSON export/import. Next milestones:
user separation, auth hardening, public alpha, payment integration, and beta
readiness.
