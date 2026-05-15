# TL Finance Core - Improvement Opportunities

## Purpose

This document records the current project review for the v0.7.7 baseline. It
separates public-readiness work from the local document archive.

## Architecture

Reviewed areas:

| Area | Status |
| --- | --- |
| Application structure | Coherent Next.js App Router structure with clear server/client split |
| Data model | Strong household boundary and additive migration history |
| Money handling | Decimal-based and suitable for finance workflows |
| Auth | Hardened sessions, verification, reset, rate-limit, and admin paths |
| Operations | Docker path supports single-node, local multinode, and public-alpha HA role layouts |
| Payments | Hosted payment-link alpha workflow is wired; webhook fulfillment remains v0.8 work |
| Security audit | Trusted public origin, CSRF origin checks, token-log suppression, and destructive-import server confirmation are implemented |
| Release automation | Verified `main` builds create idempotent GitHub Releases for new package versions |
| Documentation | Public set now structured; local archive ignored |

## Configuration

Priority scale:

| Priority | Meaning |
| --- | --- |
| P0 | Blocks safe public use |
| P1 | Should be fixed before public alpha |
| P2 | Should be addressed before beta |
| P3 | Quality or maintainability improvement |

## Deployment

Before public alpha, validate:

1. Fresh clone to first login.
2. Migration deploy on an empty database.
3. Backup creation and restore.
4. Password reset with real SMTP.
5. HA restart of one app container.
6. Payment-provider sandbox flow.

## Usage

Findings and opportunities:

| Priority | Area | Observation | Recommended work |
| --- | --- | --- | --- |
| P1 | Mail | SMTP adapter sends reset, verification, and admin test mail with explicit TLS mode and sealed credentials. | Add provider-specific production runbooks. |
| P1 | Email verification | Token generation, delivery, resend, protected app/API gates, rate limits, and single-use consume are implemented. | Add browser-level signup-to-verification tests with a local SMTP sink. |
| P1 | Backups | Manual admin-triggered `pg_dump` runner is available in the production image. | Add scheduled execution, restore command, S3-compatible upload, and failure alerting. |
| P1 | Payments | Admin can configure hosted Stripe Payment Links and users can start checkout from Settings -> Billing. | Add webhook signature verification, idempotent fulfillment, and reconciliation UI. |
| P1 | HA deployment | `docker-compose.ha.yml` can run LB, app, primary DB, and replica DB as same-node or split-host roles. | Rehearse failure drills on at least two physical/VM hosts before v0.8.0. |
| P1 | User separation | Active household selection is now explicit, users can create additional owner households, and forged foreign membership cookies are ignored. | Add invite/member role management before public SaaS use. |
| P1 | Access security | Admin pages and protected API routes are gated; CI includes static route-guard readiness checks, security-audit checks, and DB-backed tests for active-household switching, cross-tenant PATCH/DELETE, FK ownership, admin role enforcement, reset/verification hardening, and auth rate limits. | Expand to browser smoke tests before beta. |
| P2 | Redis | Redis is included in multinode compose but not used for sessions or queues. | Either wire it for rate limits/jobs or remove it until the backup/payment job queue needs it. |
| P2 | Import replace | Replace import intentionally hard-deletes household data after client confirmation. | Require server-side confirmation token, recent export warning, and admin/audit escalation before SaaS use. |
| P2 | APP_SECRET rotation | Rotating the secret makes sealed admin secrets unreadable. | Add a re-seal command or UI flow that accepts old and new secrets. |
| P2 | Test coverage | Focused unit tests, access tests, migration safety checks, and v0.8 readiness checks now exist. | Expand to forecast, ownership, import/export, payment webhook, and browser smoke coverage. |
| P3 | Naming | Legacy Swiss Budget Planner names existed in compose/scripts/docs. | Keep TL Finance Core naming consistent in code, docs, Docker metadata, and export filenames. |

## Troubleshooting

- If a finding seems outdated, verify it in source before deleting it.
- Do not move local-only planning back into public docs without rewriting it
  into the standard module structure.
- Treat review items as planning guidance, not as a substitute for issue-level
  acceptance criteria.
