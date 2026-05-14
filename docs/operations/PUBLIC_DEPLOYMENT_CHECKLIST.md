# TL Finance Core - Public Deployment Checklist

## Purpose

This checklist is the release gate for the first public self-hosted deployment.
Do not publish a public instance until every required item is complete.

## Architecture

Required production shape:

| Layer | Requirement |
| --- | --- |
| App | Docker image built from a committed `package-lock.json` with `npm ci` |
| Database | PostgreSQL with a non-default password and persistent volume |
| TLS | Real certificate at the public reverse proxy |
| Mail | SMTP configured and tested for reset + verification delivery |
| Payments | Hosted payment links configured for public-alpha tiers or explicitly disabled |
| Backups | `pg_dump` backup path writable, manual run tested, restore tested |
| CI | Node 24-compatible GitHub Actions, typecheck, lint, unit tests, readiness checks, migration safety, production dependency audit, migration deploy, auth/access integration tests, build |
| Secrets | `APP_SECRET`, DB, replication, Redis, and PgAdmin passwords replaced |
| Origin | `APP_BASE_URL` set to the public HTTPS origin |

## Configuration

Required environment values:

| Variable | Public deployment rule |
| --- | --- |
| `APP_SECRET` | 32+ characters, generated once, backed up offline |
| `APP_BASE_URL` | Public `https://...` origin used in auth emails and CSRF checks |
| `DB_PASSWORD` | Random, not `budget`, used by app and Postgres |
| `REPLICATION_PASSWORD` | Random, only for the multinode stack |
| `REDIS_PASSWORD` | Random, only for the multinode stack |
| `PGADMIN_PASSWORD` | Random; enable PgAdmin only with the `tools` profile |
| `DATABASE_URL` | Must not contain `budget:budget` credentials |

The production container refuses to start when `APP_SECRET` is missing,
placeholder-like, shorter than 32 characters, when `APP_BASE_URL` is missing,
or when `DATABASE_URL` still contains the default `budget:budget` credentials.

## Deployment

Preflight:

1. Run `npm ci`.
2. Run `npm run ci`.
3. Run `npm run test:readiness:v0.8` and inspect any failed gate before
   publishing alpha.
4. Start a fresh empty Postgres database.
5. Run `npx prisma migrate deploy`.
6. Build the Docker image.
7. Start the compose stack with real `.env` values.
8. Confirm `GET /api/health` returns `200`.
9. Create the first admin user.
10. Configure SMTP, send the built-in test email, and send verification + reset
   mails.
11. Configure hosted payment links or explicitly leave payments disabled.
12. Enable backups and run an admin-triggered backup.
13. Restore that backup into a disposable database.
14. Sign in, complete onboarding, export household JSON, import into a test household.
15. Stop one app node behind the LB and confirm the other node still serves
    `/api/health`.

## Usage

Public alpha acceptance:

| Area | Must pass |
| --- | --- |
| Auth | Signup, signin, signout, password reset, email verification, and SMTP test mail |
| Access | Unverified users cannot reach app pages or non-auth APIs |
| Tenant isolation | Protected API routes resolve an active household or admin guard; forged active-household cookies, cross-tenant mutations/deletes, and FK ownership attempts are covered by integration tests |
| Request origin | Cross-origin unsafe browser requests are rejected by middleware |
| Payments | Settings -> Billing can open the configured hosted checkout URL in sandbox/test mode |
| Operations | Backups write `.sql.gz` files and restore successfully; migrations pass additive-safety checks |
| HA | Single-node compose still runs; HA compose runs same-node or split-host LB/app/DB roles |
| Release | Docker image build runs after CI verification; Docker Hub publish runs only when credentials are configured |

## Troubleshooting

- If the app exits immediately in Docker, inspect the entrypoint error first;
  it usually means a placeholder secret is still present.
- If backup runs fail with `pg_dump_failed`, confirm the deployed image was
  rebuilt after the PostgreSQL client tools were added.
- If PgAdmin is needed, start it explicitly with
  `docker compose -f docker-compose-multinode.yml --profile tools up -d pgadmin`.
