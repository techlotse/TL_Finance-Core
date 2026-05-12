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
| Backups | `pg_dump` backup path writable, manual run tested, restore tested |
| CI | Node 24-compatible GitHub Actions, typecheck, lint, unit tests, readiness check, migration deploy, build |
| Secrets | `APP_SECRET`, DB, replication, Redis, and PgAdmin passwords replaced |

## Configuration

Required environment values:

| Variable | Public deployment rule |
| --- | --- |
| `APP_SECRET` | 32+ characters, generated once, backed up offline |
| `DB_PASSWORD` | Random, not `budget`, used by app and Postgres |
| `REPLICATION_PASSWORD` | Random, only for the multinode stack |
| `REDIS_PASSWORD` | Random, only for the multinode stack |
| `PGADMIN_PASSWORD` | Random; enable PgAdmin only with the `tools` profile |
| `DATABASE_URL` | Must not contain `budget:budget` credentials |

The production container refuses to start when `APP_SECRET` is missing,
placeholder-like, shorter than 32 characters, or when `DATABASE_URL` still
contains the default `budget:budget` credentials.

## Deployment

Preflight:

1. Run `npm ci`.
2. Run `npm run ci`.
3. Start a fresh empty Postgres database.
4. Run `npx prisma migrate deploy`.
5. Build the Docker image.
6. Start the compose stack with real `.env` values.
7. Confirm `GET /api/health` returns `200`.
8. Create the first admin user.
9. Configure SMTP and send verification + reset mails.
10. Enable backups and run an admin-triggered backup.
11. Restore that backup into a disposable database.
12. Sign in, complete onboarding, export household JSON, import into a test household.

## Usage

Public alpha acceptance:

| Area | Must pass |
| --- | --- |
| Auth | Signup, signin, signout, password reset, and email verification |
| Access | Unverified users cannot reach app pages or non-auth APIs |
| Tenant isolation | Protected API routes resolve an active household or admin guard |
| Operations | Backups write `.sql.gz` files and restore successfully |
| Release | Docker image build runs after CI verification; Docker Hub publish runs only when credentials are configured |

## Troubleshooting

- If the app exits immediately in Docker, inspect the entrypoint error first;
  it usually means a placeholder secret is still present.
- If backup runs fail with `pg_dump_failed`, confirm the deployed image was
  rebuilt after the PostgreSQL client tools were added.
- If PgAdmin is needed, start it explicitly with
  `docker compose -f docker-compose-multinode.yml --profile tools up -d pgadmin`.
