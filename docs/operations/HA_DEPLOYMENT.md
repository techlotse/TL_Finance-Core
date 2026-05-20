# TL Finance Core - HA Deployment

## Purpose

This document describes the v0.7.9 public-alpha high-availability topology.
The same release must still run as a single-node Docker app.

## Architecture

Target:

```text
Person -> LB -> HA web -> HA DB
```

Default public-alpha path:

```text
Person
  -> NGINX load balancer
    -> app host 1
    -> app host 2
      -> PostgreSQL primary
      -> PostgreSQL replica
```

The DB can run on the same host as the apps, on a separate DB host, or as a
primary plus hot standby. The app only writes to the primary in v0.7.9.
Failover is operational/manual until a managed Postgres or automated failover
layer is introduced.

## Single-Node Options

For the simplest deployment, keep using:

```bash
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

For same-machine HA rehearsal with NGINX, two web containers, primary DB, and
replica DB:

```bash
DATABASE_URL="postgresql://budget:${DB_PASSWORD}@postgres-primary:5432/budget?schema=public" \
docker compose -f docker-compose.ha.yml \
  --profile lb --profile app --profile db-primary --profile db-replica \
  up -d --build

docker compose -f docker-compose.ha.yml exec app-1 npx prisma migrate deploy
```

## Multi-Host Roles

Use `docker-compose.ha.yml` on each host with only the relevant profile.

DB primary host:

```bash
TLFC_DB_BIND=10.0.10.20 \
docker compose -f docker-compose.ha.yml --profile db-primary up -d
```

DB replica host:

```bash
POSTGRES_PRIMARY_HOST=10.0.10.20 \
TLFC_DB_REPLICA_BIND=10.0.10.21 \
docker compose -f docker-compose.ha.yml --profile db-replica up -d
```

App host:

```bash
DATABASE_URL="postgresql://budget:${DB_PASSWORD}@10.0.10.20:5432/budget?schema=public" \
TLFC_APP_1_BIND=10.0.20.11 \
TLFC_APP_2_BIND=10.0.20.11 \
docker compose -f docker-compose.ha.yml --profile app up -d --build
```

LB host:

```bash
TLFC_APP_UPSTREAM_1=10.0.20.11:3001 \
TLFC_APP_UPSTREAM_2=10.0.20.12:3001 \
docker compose -f docker-compose.ha.yml --profile lb up -d
```

If an external load balancer is supplied, skip the `lb` profile and point the
external LB at each app host's `/api/health` endpoint.

## Network Requirements

- The LB can reach each app host on the configured app port.
- Each app host can reach the PostgreSQL primary.
- The replica can reach the primary on port 5432.
- DB ports should bind only to private interfaces or be firewall-restricted.
- Every app container must use the same `APP_SECRET`.

## Upgrade Policy

- Run `npm run test:migrations` before deployment.
- Apply Prisma migrations once against the primary.
- Do not edit applied migration files.
- From v0.7.5 onward, migration SQL must be additive by default.
- Restore an exported household JSON into a disposable instance before a public
  upgrade window.

## Failure Testing

For v0.8.0 readiness, rehearse:

1. Stop one app container and confirm the LB still serves `/api/health`.
2. Restart the stopped app container and confirm sessions still work.
3. Stop the DB replica and confirm the app continues writing to primary.
4. Restore a backup into a disposable database.
5. Confirm `/admin` is reachable only by an admin-role user.
