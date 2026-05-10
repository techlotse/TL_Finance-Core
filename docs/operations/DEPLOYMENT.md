# TL Finance Core - Deployment

## Purpose

This document describes how to run TL Finance Core v0.5.0 locally, in Docker,
and in the bundled multinode Docker Desktop topology.

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

`GET /api/health` validates application liveness and database readiness.

## Configuration

Create `.env` from `.env.example` and set at least:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma connection URL |
| `APP_SECRET` | Yes | 32+ random bytes, backup required |
| `DB_PASSWORD` | Yes | Database password; must replace the local default |
| `REPLICATION_PASSWORD` | Multinode | PostgreSQL replica password |
| `REDIS_PASSWORD` | Multinode | Redis password |
| `PGADMIN_EMAIL` | Optional | PgAdmin login |
| `PGADMIN_PASSWORD` | Optional | PgAdmin login |

Production containers fail fast if `APP_SECRET` is missing, too short, or left
as a placeholder, and if the runtime database URL still contains the default
`budget:budget` credentials.

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

Backups:

- The production image includes `pg_dump`.
- Compose mounts `/var/backups/tl-finance-core` as a persistent volume.
- Enable backups in Admin, then run the manual backup action.
- Restore every public-release backup into a disposable database before
  trusting the deployment.

## Troubleshooting

- If Postgres fails to initialize in multinode, verify `docker-compose-multinode.yml`
  still uses YAML list form for the primary `command`.
- If nginx returns 502, check `app-1` and `app-2` health checks.
- If the app cannot decrypt admin secrets, confirm `APP_SECRET` matches the
  value used when the secrets were saved.
- If migrations fail, inspect `prisma/migrations/` and do not edit applied
  migration files.
