# TL Finance Core - Changelog

## Purpose

This document records public release notes for TL Finance Core.

## Architecture

Versioning follows semantic-version style while the project is pre-1.0. Public
repository transfer starts at `v0.5.0`.

## Configuration

Release metadata should be updated in:

| File | Value |
| --- | --- |
| `package.json` | `name`, `version` |
| `README.md` | visible version badge and repository links |
| `.github/workflows/docker-publish.yml` | Docker image name |
| `docs/release/CHANGELOG.md` | release notes |

## Deployment

Tag releases with `v<major>.<minor>.<patch>`. The Docker workflow publishes
branch, SHA, semver, and latest tags when configured with Docker Hub secrets.

## Usage

## Unreleased

No public changes yet.

## v0.7.0 - 2026-05-13

Authentication and access security hardening.

Changed:

- Added configurable hourly rate limits for password reset requests and email
  verification resend requests.
- Made password reset and email verification token consumption atomic and
  single-use under concurrent requests.
- Revoked all existing user sessions inside the password-reset completion
  transaction.
- Hardened account, category, category-group, and income-earner delete routes
  so ownership is checked before reference counts, preventing foreign-row
  existence leaks through conflict responses.
- Added foreign-key ownership enforcement to investment-projection PATCH.
- Expanded DB-backed auth/access integration coverage to cross-tenant PATCH and
  DELETE matrices, foreign-key attachment attempts, admin role enforcement,
  auth rate limits, reset token reuse, verification token reuse, and session
  revocation.

## v0.6.0 - 2026-05-12

Public-deployment hardening after the v0.5.0 handoff.

Changed:

- Added explicit active-household selection in desktop and mobile navigation.
- Added household membership management in Settings, including creation of
  additional owner households from the onboarding preset schema.
- Added `GET /api/household/list` and `POST /api/household/create` alongside
  the validated household switch endpoint.
- Added DB-backed access-control integration tests for forged active-household
  cookies, cross-user household switching, valid own-household switching, and
  cross-tenant account mutation rejection.
- Added a dedicated Vitest integration config and CI step for the access suite.
- Added production SMTP controls for explicit TLS mode, verified From address,
  sealed password refresh, and admin-triggered test email delivery.
- Added locked npm dependency installation with `package-lock.json`.
- Added CI verification before Docker publish: install, Prisma generate,
  typecheck, lint, unit tests, readiness checks, migration deploy, access tests,
  and build.
- Upgraded GitHub workflow actions to Node 24-compatible major versions.
- Upgraded Next.js to 15.5.18 to clear production npm audit findings while
  staying on the locked Next.js 15 stack.
- Upgraded Prisma ORM to 7.8.0 with `prisma.config.ts`, generated client
  output under `src/generated/prisma`, and the PostgreSQL driver adapter.
- Made Docker Hub publish conditional on configured Docker Hub credentials while
  keeping the multi-arch image build in CI, without generating Docker Hub tags
  when publish secrets are absent.
- Published Docker images under the fixed `techlotse` Docker Hub namespace
  instead of deriving the repository path from the login username.
- Added email-verification app/API gates and a resend screen.
- Added production Docker entrypoint validation for placeholder secrets.
- Added `pg_dump` support to the runtime image and hardened the backup runner.
- Removed default multinode exposure of app debug ports, PostgreSQL, and Redis.
- Added focused unit tests and public-readiness checks.
- Upgraded direct dependencies to remove known high-severity npm advisories.

## v0.5.0 - 2026-04-30

Public handoff baseline for `techlotse/TL-Finance-Core`.

Included:

- Docker-first Next.js 15 household finance application.
- PostgreSQL persistence through Prisma migrations.
- First-party signup, signin, signout, reset-token persistence, and DB-backed sessions.
- Household onboarding with base currency, earners, and category presets.
- Budget, accounts, balance snapshots, transfers, assets, debt, forecast, and investment projections.
- Admin configuration for auth, mail, backups, observability, and audit retention.
- AES-256-GCM sealed admin secrets keyed by `APP_SECRET`.
- Household JSON export/import for portable backups.
- Docker single-node and multinode local stacks.
- Public documentation reorganized under `docs/`.

Known limitations:

- Scheduled backup execution and S3-compatible upload are not implemented.
- Redis is present in the multinode stack but sessions remain database-backed.
- Multi-household schema exists, but UI separation is planned for v0.6.0.

## Troubleshooting

- Do not use pre-`v0.5.0` root planning documents as release documentation.
- Check `docs/review/IMPROVEMENT_OPPORTUNITIES.md` before planning the next release.
