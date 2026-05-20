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
| `package-lock.json` | locked package `version` |
| `README.md` | visible version badge and repository links |
| `.github/workflows/docker-publish.yml` | Docker image name |
| `docs/release/CHANGELOG.md` | release notes |

## Deployment

Releases use the `v<major>.<minor>.<patch>` tag format. After a successful
merge to `main`, the Docker workflow verifies the project, builds the image,
publishes branch/SHA/latest tags when Docker Hub secrets exist, and creates a
GitHub Release for the current `package.json` version if that tag does not
already exist. New main releases also publish package semver Docker tags when
Docker Hub publishing is enabled.

## Usage

## Unreleased

Changed:

- No public changes yet.

## v0.7.9 - 2026-05-20

Swiss Bridge advice and SMTP diagnostics.

Changed:

- Added Swiss Bridge as a third advice module with three resilience tiers:
  immediate cash bridge, three-month notice bridge, and twelve-month notice
  extended cover.
- Included Swiss Bridge context in AI advice requests.
- Hardened admin SMTP save/test calls to request JSON explicitly and report
  non-JSON proxy/auth responses with actionable context instead of raw JSON
  parser failures.
- Normalized blank optional SMTP fields to `null` before validation.
- Added explicit SMTP TLS server-name configuration for providers such as
  Hostpoint on implicit TLS port 465.
- Added focused unit coverage for Swiss Bridge tier calculations and SMTP
  transport options.

## v0.7.8 - 2026-05-19

Financial planning bugfixes.

Changed:

- Added admin user-access management under `/admin/users` so an admin can
  manually grant Core, Smart, or AI access and suspend/reactivate accounts
  without changing user roles.
- Added account-level Retirement / Pillar 3a and Kids saving flags.
- Included retirement-flagged accounts in investment planning and Investments
  page account projections.
- Included scheduled transfers into investment or retirement accounts as
  recurring contributions in investment-account projection charts.
- Counted ordinary savings accounts toward emergency reserves while excluding
  kids savings and retirement accounts from emergency-fund buffers.
- Changed emergency-fund targets to 3 months when essentials fit within the
  lowest earner's monthly income, or 5 months when they do not.
- Dropped underfunded emergency recommendations to medium priority when cash
  savings exceed monthly household income and non-retirement investments exceed
  annual household income.
- Excluded Kids saving accounts from household wealth forecast totals while
  still showing their account-level balances.
- Fixed account monthly fee currency handling so edited non-CHF pockets do not
  silently submit stale CHF values, and AI advice receives the native fee
  currency plus base-currency equivalent.
- Tightened scheduled-transfer validation so source and target currencies must
  exist as pockets on their selected accounts.
- Counted scheduled transfers into investment-type accounts as planned
  investing for Smart/AI analysis, without requiring a duplicate investment
  budget item.

## v0.7.7 - 2026-05-15

Mitigated CVE risks.

Changed:

- Moved the Docker build/runtime base to Node 24 Alpine.
- Pinned the image's global npm to `11.14.1`, which replaces the vulnerable
  base-image `picomatch@4.0.3` copy reported by Docker Scout as
  `CVE-2026-33671` with `picomatch@4.0.4`.
- Updated GitHub Actions verification to run on Node 24 to match the Docker
  runtime family.
- Added readiness/security checks that enforce the Node 24 base image and
  pinned fixed npm version.

## v0.7.6 - 2026-05-14

Release automation.

Changed:

- Added automatic GitHub Release creation after a successful verified build on
  `main`.
- Made release creation idempotent by skipping versions whose `vX.Y.Z` tag or
  GitHub Release already exists.
- Added package-version Docker semver tags to the successful main build that
  creates a new release.
- Added `npm run test:release` to validate the current changelog entry and
  release workflow hooks before CI can publish.

## v0.7.5 - 2026-05-13

Security audit and hardening.

Changed:

- Added `APP_BASE_URL` as a required production setting so password-reset and
  verification emails do not trust request `Host` headers.
- Added middleware-level same-origin checks for unsafe browser requests and
  baseline security headers for app responses.
- Stopped production fallback mail/auth logs from including bearer reset or
  verification links.
- Sanitized sign-in `next` redirects to local paths only.
- Restricted public-alpha Stripe checkout and billing portal URLs to Stripe
  hosted domains and revalidated before redirecting users.
- Required server-side typed confirmation for destructive household replace
  imports.
- Made first-user admin assignment run inside a serializable transaction.
- Added `npm run test:security` to CI.
- Added focused tests for trusted origin handling, redirect sanitization, and
  payment URL allowlists.

## v0.7.3 - 2026-05-13

Public-alpha preparation.

Changed:

- Kept SaaS administration under the protected `/admin` endpoint and added a
  Payments section for public-alpha billing setup.
- Added admin-managed hosted payment-link configuration and a user-facing
  Settings -> Billing workflow backed by `POST /api/billing/checkout`.
- Added hosted checkout URL generation with `prefilled_email`,
  `client_reference_id`, and alpha UTM parameters for reconciliation.
- Added a v0.8 readiness check suite covering admin isolation, payments,
  HA deployment assets, migration safety, route guards, and backup import
  compatibility.
- Added a migration additive-safety check to reject destructive migration SQL
  in CI.
- Added `docker-compose.ha.yml` plus an NGINX template for same-node or
  split-host LB/app/DB role deployments.
- Documented HA deployment across separate LB, web, DB primary, and DB replica
  hosts.
- Changed household import API compatibility to accept older supported export
  versions instead of only the current export version.

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
