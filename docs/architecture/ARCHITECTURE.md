# TL Finance Core - Architecture

## Purpose

This document describes the runtime architecture for TL Finance Core v0.7.3.
It is the source document for contributors who need to understand how requests,
data, money calculations, and security boundaries move through the system.

## Architecture

TL Finance Core is a single Next.js application backed by PostgreSQL. Server
components read through Prisma. Client components mutate through REST route
handlers under `src/app/api/**`.

```text
Browser
  -> Next.js App Router
     -> Server components for reads
     -> API routes for mutations
     -> src/lib for auth, ownership, audit, forecast, money, FX
        -> Prisma ORM
           -> PostgreSQL 16
```

The multinode stack adds nginx, two app containers, Redis, and a PostgreSQL hot
standby:

```text
Browser
  -> nginx :443
     -> app-1 :3000
     -> app-2 :3000
        -> postgres-primary :5432
        -> redis :6379
postgres-primary -> streaming replication -> postgres-replica
```

The public-alpha HA role stack can run the same shape on one host or split it
across private hosts:

```text
Person -> LB -> HA web -> HA DB
```

Important boundaries:

| Boundary | Rule |
| --- | --- |
| Auth | Middleware checks cookie presence; route handlers validate sessions against the database |
| Tenant data | Every household resource is scoped by `householdId` |
| Foreign keys | Write paths assert ownership before attaching related IDs |
| Money | Decimal arithmetic only; no persisted JS floats |
| Secrets | Admin SMTP/S3 secrets are AES-256-GCM sealed with `APP_SECRET` |
| Billing | Hosted checkout links are configured by admins; no card data touches the app |
| Audit | State-changing routes write append-only audit events |

## Configuration

Required runtime configuration is supplied through environment variables. The
app depends on `DATABASE_URL` and `APP_SECRET`. Exchange-rate configuration is
optional and defaults to Frankfurter.

The UI architecture uses the TL Finance Core visual contract: dark mode first,
Inter, 8px spacing, line icons, and the purple to cyan gradient only for
primary emphasis.

## Deployment

The Dockerfile builds a production Next.js image with Prisma generated during
the build. The single-node compose file is suitable for local validation and
personal self-hosting. The multinode compose file is suitable for local HA
testing on Docker Desktop. `docker-compose.ha.yml` is the public-alpha role
file for same-node or split-host HA rehearsal.

Run database migrations after the containers are healthy:

```bash
docker compose exec app npx prisma migrate deploy
```

or, for multinode:

```bash
docker compose -f docker-compose-multinode.yml exec app-1 npx prisma migrate deploy
```

## Usage

When adding features:

1. Add or extend a Zod schema in `src/lib/schemas.ts`.
2. Validate API input before touching Prisma.
3. Resolve the active household from `src/lib/household.ts`.
4. Assert ownership for every supplied related ID.
5. Persist money as `Decimal`.
6. Write audit events for state changes.
7. Update the matching document in `docs/`.

## Troubleshooting

- If middleware cannot import a helper, check whether that helper depends on
  Prisma, bcrypt, or Node-only APIs. Middleware runs in the Edge runtime.
- If data leaks across households, inspect the route for missing
  `householdId` filters or missing ownership assertions.
- If forecast totals drift, check whether amounts crossed a server-to-client
  boundary as JSON numbers instead of strings.
- Redis is present in the multinode stack but is not the v0.7.3 session store.
