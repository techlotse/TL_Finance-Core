# TL Finance Core - Deployment

## Purpose

This document describes how to run TL Finance Core v0.7.5 locally, in Docker,
in the bundled multinode Docker Desktop topology, and in the public-alpha HA
role topology.

## Architecture

Single node:

```text
app -> postgres
```

Multinode:

```text
nginx
  -> app-1
  -> app-2
       -> postgres-primary
       -> redis
postgres-primary -> postgres-replica
pgadmin optional on :5050
```

Public-alpha HA:

```text
Person -> LB -> HA web -> HA DB
```

`GET /api/health` validates application liveness and database readiness.

## Configuration

Create `.env` from `.env.example` and set at least:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma connection URL |
| `APP_SECRET` | Yes | 32+ random bytes, backup required |
| `APP_BASE_URL` | Yes | Public origin for auth links and same-origin checks |
| `DB_PASSWORD` | Yes | Database password; must replace the local default |
| `REPLICATION_PASSWORD` | Multinode | PostgreSQL replica password |
| `REDIS_PASSWORD` | Multinode | Redis password |
| `PGADMIN_EMAIL` | Optional | PgAdmin login |
| `PGADMIN_PASSWORD` | Optional | PgAdmin login |
| `TLFC_APP_UPSTREAM_1/2` | HA LB | App host:port targets for NGINX |
| `TLFC_DB_BIND` | HA DB | Private interface to expose PostgreSQL on |

Production containers fail fast if `APP_SECRET` is missing, too short, or left
as a placeholder, if `APP_BASE_URL` is missing or invalid, and if the runtime
database URL still contains the default `budget:budget` credentials.

Generate a secret:

```bash
openssl rand -hex 32
```

## Deployment

Single node:

```bash
cp .env.example .env
# Replace APP_SECRET and DB_PASSWORD before starting.
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

Multinode on Linux or macOS:

```bash
./setup-local.sh
docker compose -f docker-compose-multinode.yml up -d --build
docker compose -f docker-compose-multinode.yml exec app-1 npx prisma migrate deploy
docker compose -f docker-compose-multinode.yml exec app-1 npx prisma db seed
```

Multinode on Windows PowerShell:

```powershell
.\setup-local.ps1
docker compose -f docker-compose-multinode.yml up -d --build
docker compose -f docker-compose-multinode.yml exec app-1 npx prisma migrate deploy
docker compose -f docker-compose-multinode.yml exec app-1 npx prisma db seed
```

Public-alpha HA roles:

```bash
docker compose -f docker-compose.ha.yml --profile db-primary up -d
docker compose -f docker-compose.ha.yml --profile app up -d --build
docker compose -f docker-compose.ha.yml --profile lb up -d
```

Detailed same-node and multi-host examples live in
[HA_DEPLOYMENT.md](HA_DEPLOYMENT.md).

## Usage

Operational commands:

| Task | Command |
| --- | --- |
| Health | `curl http://localhost:3000/api/health` |
| Logs | `docker compose logs -f app` |
| Stop single node | `docker compose down` |
| Stop multinode | `docker compose -f docker-compose-multinode.yml down` |
| Typecheck in app container | `docker compose exec app npx tsc --noEmit` |
| Start PgAdmin | `docker compose -f docker-compose-multinode.yml --profile tools up -d pgadmin` |
| HA readiness | `npm run test:readiness:v0.8` |
| Migration safety | `npm run test:migrations` |

Backups:

- The production image includes `pg_dump`.
- Compose mounts `/var/backups/tl-finance-core` as a persistent volume.
- Enable backups in Admin, then run the manual backup action.
- Restore every public-release backup into a disposable database before
  trusting the deployment.

Mail:

- Configure SMTP in Admin -> Mail after first login.
- Use port 587 with "Require STARTTLS" for most hosted SMTP providers, or port
  465 with "Implicit TLS / SSL" when the provider documents implicit TLS.
- Set From email to the verified sender address required by the provider.
- Send the built-in test email before enabling required email verification or
  relying on password reset delivery.

Payments:

- Configure public-alpha payment links in Admin -> Payments.
- The user-facing flow appears under Settings -> Billing.
- v0.7.5 redirects to hosted payment links only; webhook fulfillment is a
  v0.8.0 readiness item. See [PAYMENTS_ALPHA.md](PAYMENTS_ALPHA.md).

## Troubleshooting

- If the SMTP test fails, confirm the provider allows SMTP password/app-password
  authentication for the configured user and that the From email is an allowed
  sender.
- If Postgres fails to initialize in multinode, verify `docker-compose-multinode.yml`
  still uses YAML list form for the primary `command`.
- If nginx returns 502, check `app-1` and `app-2` health checks.
- If the app cannot decrypt admin secrets, confirm `APP_SECRET` matches the
  value used when the secrets were saved.
- If migrations fail, inspect `prisma/migrations/` and do not edit applied
  migration files.
- If an exported household JSON does not import, verify the target app version
  is the same or newer than the export's `version`.
