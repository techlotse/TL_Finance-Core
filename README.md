# TL Finance Core - Repository Overview

[![Docker Build](https://github.com/techlotse/TL-Finance-Core/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/techlotse/TL-Finance-Core/actions/workflows/docker-publish.yml)
[![Version](https://img.shields.io/badge/version-0.7.6-7A3CFF)](https://github.com/techlotse/TL-Finance-Core/releases/tag/v0.7.6)
[![License](https://img.shields.io/badge/license-Source%20Available-00D1C7)](./LICENSE)

## Purpose

TL Finance Core is a Docker-first household finance application for budgeting,
forecasting, account tracking, asset tracking, debt visibility, and investment
projection. The v0.7.6 release keeps the public handoff feature set stable,
adds security hardening on top of hosted payment-link readiness and HA
deployment planning, and automates GitHub release creation after verified
`main` builds before the v0.8.0 public-alpha cut.

The product is built for privacy-preserving self-hosting first. It includes
first-party email/password authentication, PostgreSQL persistence, tenant-scoped
household data, active household switching, rate-limited auth flows, audit
logging, portable JSON import/export, public-alpha billing setup, and a
dark-mode first interface aligned to TL Finance Core Style Guide v1.0.

## Architecture

| Layer | Current implementation |
| --- | --- |
| Framework | Next.js 15 App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS, Inter, Lucide line icons, 8px grid |
| Data | PostgreSQL 16, Prisma ORM, additive migrations |
| Money math | decimal.js, persisted `Decimal(18, 4)`, string wire format |
| Auth | bcryptjs cost 12, DB-backed sessions, HTTP-only cookie |
| Security | tenant ownership checks, audit log, sealed admin secrets |
| Forecasting | recurring budget items, transfers, balance snapshots, FX cache |
| Deployment | Docker, optional nginx load balancer, PostgreSQL hot standby |
| CI | GitHub Actions verification, Docker build, automatic GitHub Releases, and optional Docker Hub publish |

Project layout:

```text
src/app/                  App Router pages and API route handlers
src/app/admin/            Instance administration UI
src/app/api/              REST endpoints used by client components
src/components/           App shell, charts, UI primitives, money rendering
src/lib/                  Auth, audit, forecast, money, ownership, export/import
prisma/                   Schema, migrations, seed data
postgres/                 Local primary/replica bootstrap scripts
docs/                     Public documentation, grouped by module
old-docs/                 Local-only archive, ignored by git
```

## Configuration

Copy `.env.example` to `.env` and replace every development secret before use.
The required production values are:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma |
| `APP_SECRET` | Yes | 32+ random bytes; seals admin secrets and must be backed up |
| `APP_BASE_URL` | Yes | Public origin used in auth emails and CSRF origin checks |
| `EXCHANGE_RATE_PROVIDER` | No | Defaults to `frankfurter` |
| `FRANKFURTER_BASE_URL` | No | Defaults to `https://api.frankfurter.app` |
| `DB_PASSWORD` | Multinode/HA | PostgreSQL password for the HA compose stack |
| `REPLICATION_PASSWORD` | Multinode/HA | PostgreSQL streaming replication password |
| `REDIS_PASSWORD` | Multinode | Password for the bundled Redis service |

The active style contract is dark mode first (`#0B0F14`), purple to cyan
gradient (`#7A3CFF` to `#00D1C7`), Inter typography, max width 1200px, 8px
spacing, line icons, and technical copy without marketing language.

## Deployment

Single-node local run:

```bash
cp .env.example .env
# Replace APP_SECRET and DB_PASSWORD before starting, or use setup-local.sh
# for the multinode stack to generate random local secrets automatically.
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

Multinode local run:

```bash
./setup-local.sh
docker compose -f docker-compose-multinode.yml up -d --build
docker compose -f docker-compose-multinode.yml exec app-1 npx prisma migrate deploy
docker compose -f docker-compose-multinode.yml exec app-1 npx prisma db seed
```

Windows PowerShell can use `.\setup-local.ps1` instead of `./setup-local.sh`.
Open `http://localhost:3000` for single node or `https://localhost` for the
nginx multinode stack.

Public-alpha HA roles are documented in
[docs/operations/HA_DEPLOYMENT.md](docs/operations/HA_DEPLOYMENT.md). The
bundled `docker-compose.ha.yml` can run same-node HA or split LB, app, and DB
roles across private hosts.

## Usage

1. Sign up. The first user becomes the instance administrator.
2. Complete onboarding: household name, base currency, earners, and category preset.
3. Add accounts and current balances.
4. Add income, expenses, investment contributions, transfers, and assets.
5. Use Dashboard, Forecast, Debt, and Investments to inspect current state and projections.
6. Use Settings to export/import household JSON and Admin to manage auth, mail, payments, backups, observability, and audit retention.

Public documentation:

| Module | Path |
| --- | --- |
| Documentation index | [docs/README.md](docs/README.md) |
| Architecture | [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) |
| Data model | [docs/architecture/DATA_MODEL.md](docs/architecture/DATA_MODEL.md) |
| Deployment | [docs/operations/DEPLOYMENT.md](docs/operations/DEPLOYMENT.md) |
| Public deployment checklist | [docs/operations/PUBLIC_DEPLOYMENT_CHECKLIST.md](docs/operations/PUBLIC_DEPLOYMENT_CHECKLIST.md) |
| API | [docs/reference/API.md](docs/reference/API.md) |
| Database schema | [docs/reference/DATABASE_SCHEMA.md](docs/reference/DATABASE_SCHEMA.md) |
| Category presets | [docs/reference/DEFAULT_CATEGORIES.md](docs/reference/DEFAULT_CATEGORIES.md) |
| User guide | [docs/product/USER_GUIDE.md](docs/product/USER_GUIDE.md) |
| UI spec | [docs/design/UI_SPEC.md](docs/design/UI_SPEC.md) |
| Roadmap | [docs/strategy/ROADMAP.md](docs/strategy/ROADMAP.md) |
| Improvement opportunities | [docs/review/IMPROVEMENT_OPPORTUNITIES.md](docs/review/IMPROVEMENT_OPPORTUNITIES.md) |
| Release notes | [docs/release/CHANGELOG.md](docs/release/CHANGELOG.md) |
| Announcement post | [docs/blogpost/ANNOUNCEMENT_POST.md](docs/blogpost/ANNOUNCEMENT_POST.md) |

## Troubleshooting

- `APP_SECRET` cannot be recovered. If it is lost or rotated, sealed SMTP and
  S3 secrets must be re-entered.
- `GET /api/health` returns 503 when PostgreSQL is unreachable.
- If the multinode database does not initialize, verify shell scripts are LF
  and that the postgres `command:` remains YAML list form.
- The PostgreSQL replica is available for standby/failover, but Prisma reads
  and writes through the primary in v0.7.6.
- SMTP delivery and hosted payment-link setup are available through admin
  configuration. Scheduled backup execution, S3-compatible upload, and payment
  webhook fulfillment remain roadmap items.
